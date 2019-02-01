import ZeroClientProvider from 'web3-provider-engine/zero'
import uuidv1 from 'uuid/v1'
import secp256k1 from 'secp256k1'
import cryptoRandomString from 'crypto-random-string'
import ecies from 'eth-ecies'

const WALLET_LINKER_DATA = 'walletLinkerData'
const LOCAL_KEY_STORE = 'walletLinker:lks'
const PLACEHOLDER_ADDRESS = '0x3f17f1962B36e491b30A40b2405849e597Ba5FB5'

class MobileLinker {
  constructor({ httpUrl, wsUrl, web3 }) {
    this.httpUrl = httpUrl
    this.wsUrl = wsUrl
    this.sessionToken = null
    // code for linking via QR code
    this.linkCode = null
    this.linked = false
    console.log('1', this.web3)
    this.web3 = web3
    this.messagesWS = null

    // provider stuff
    this.accounts = []
    this.callbacks = {}
    this.pendingCall = null
    this.netId = 999 // TODO: unhardcode this
  }

  async link() {
    return await this.generateLinkCode()
  }

  getNetId() {
    // TODO: implement this despite this.web3.eth.net.getId() being async
    return this.netId
  }

  // TODO: extract later
  getAccounts(callback) {
    console.log('getAccounts')
    if (callback) {
      callback(undefined, this.accounts)
    } else {
      return new Promise(resolve => {
        resolve(this.accounts)
      })
    }
  }


  async createCall(method, params) {
    return {
      method,
      net_id: await this.getNetId(),
      params
    }
  }

  // TODO: extract later
  processTransaction(txn, callback) {
    console.log('processTransaction called', txn)
    txn.gasLimit = txn.gas

    // TODO: explain this
    if (txn.from.toLowerCase() === PLACEHOLDER_ADDRESS.toLowerCase()) {
      txn.from = undefined
    }

    const callId = uuidv1()
    this.callbacks[callId] = async data => callback(undefined, data.hash)

    // TODO: what is processTransaction
    const call = this.createCall('processTransaction', { txn })
    if (!this.linked) {
      this.pendingCall  = { callId, call }
      // TODO: start link --> how do we do this?
    } else {
      const callWalletUrl = `/api/wallet-linker/call-wallet/${this.sessionToken}`
      const resp = this.post(callWalletUrl, {
        call_id: callId,
        accounts: this.accounts,
        call,
        return_url: this.getReturnUrl()
      })

      resp
        .then(() => {}) // TODO: understand this
        .catch(err => {
          delete this.callbacks[callId]
          callback(err)
        })
    }

  }

  getProvider() {
    console.log('getProvider')
    //const linkerProvider = new LinkerProvider()
    const provider = ZeroClientProvider({
      rpcUrl: 'http://localhost:8545', // TODO: pass this in
      getAccounts: this.getAccounts.bind(this),
      processTransaction: this.processTransaction.bind(this)
    })

    // TODO: understand this
    const hookedWallet = provider._providers[6]
    if (!hookedWallet.validateTransaction) {
      console.error('The sub provider at [6] is NOT a hooked wallet.')
    } else {
      // Pass through validate for now
      hookedWallet.validateTransaction = (_, cb) => {
        console.log('noop validateTransaction')
        cb()
      }
    }

    console.log(provider._providers)
    // Disable caching subProviders, because they interfere.
    provider._providers.splice(3, 1)
    provider._providers.splice(4, 1)
    provider.isOrigin = true
    console.log('returned provider', provider)
    return provider
  }

  getLinkPrivKey() {
    console.log('getLinkPrivKey')
    const localKey = localStorage.getItem(LOCAL_KEY_STORE)
    const privKey = localKey || cryptoRandomString(64).toString('hex')
    if (privKey != localKey)
    {
      localStorage.setItem(LOCAL_KEY_STORE, privKey)
    }
    return privKey
  }

  getLinkPubKey() {
    console.log('getLinkPubKey')
    return secp256k1
      .publicKeyCreate(new Buffer(this.getLinkPrivKey(), 'hex'), false)
      .slice(1)
      .toString('hex')
  }

  ecDecrypt(buffer) {
    const priv_key = this.getLinkPrivKey()
    return ecies.decrypt(
        new Buffer(priv_key, 'hex'),
        new Buffer(buffer, 'hex')
      )
      .toString('utf8')
  }

  // Grabs link code, which is used to generate QR codes.
  async generateLinkCode() {
    console.log('generateLinkCode called')
    const resp = await this.post('/api/wallet-linker/generate-code', {
      session_token: this.sessionToken,
      returnUrl: this.getReturnUrl(),
      pending_call: this.pendingCall, // TODO: fill this in
      pub_key: this.getLinkPubKey(),
      notify_wallet: this.notifyWallet
    })
    console.log('got link code response:', resp)
    this.linkCode = resp.link_code
    this.linked = resp.linked
    if (this.sessionToken !== resp.sessionToken) {
      this.sessionToken = resp.session_token
      this.streamWalletMessages()
    }
    this.saveSessionStorage()
    return resp.link_code
  }

  closeWalletMessages() {
    if (this.messagesWS && this.messagesWS.readyState !== this.messagesWS.CLOSED) {
      this.messagesWS.close()
      this.messagesWS = null
    }
  }

  // Stream mobile wallet messages from the linking server. Not to be confused
  // with Origin Messaging.
  async streamWalletMessages() {
    this.closeWalletMessages()
    if (!this.sessionToken) {
      throw new Error('Cannot sync messages without session token')
    }
    const sessionToken = this.sessionToken || '-'
    const messageId = this.lastMessageId || 0
    const wsUrl = `${this.wsUrl}/api/wallet-linker/linked-messages/${sessionToken}/${messageId}`
    const ws = new WebSocket(wsUrl)

    ws.onmessage = e => this.processWalletMessage(JSON.parse(e.data))

    ws.onclose = e => {
      console.log('messages websocket closed:', e)
      if (e.code != 1000) {
        // If this is an abnormal close, try to reopen soon.
        setTimeout(() => {
          if (this.msg_ws === ws) {
            this.syncLinkMessages()
          }
        }, 30000)
      }
    }

    this.messagesWS = ws
  }

  processWalletMessage(m) {
    const { type, data } = m.msg
    const id = m.msgId

    switch(type) {
      case 'CONTEXT':
        this.handleContextMessage(data)
        break

      default:
        console.log('unknown message', type, data)
    }

    if (id) {
      this.lastMessageId = id
      this.saveSessionStorage()
    }
  }

  // Handles the CONTEXT message, which contains the state for the linked
  // mobile wallet.
  handleContextMessage(msg) {
    console.log('received context message:', msg)
    if (msg.sessionToken) {
      this.sessionToken = msg.sessionToken
    }

    if (!msg.linked && this.linked) {
      throw new Error('TODO: logout')
    }

    this.linked = msg.linked
    if (this.linked) {
      // TODO: cancel pending links
    }

    const device = msg.device
    if (!device) {
      console.log('no device info found')
      this.accounts = []
      return
    }

    console.log('device info found')
    this.accounts = device.accounts

    // TODO: do we need to handle msg.network_rpc?
    if (device.priv_data) {
      const data = JSON.parse(this.ecDecrypt(device.priv_data))
      if (data && data.essaging && this.callbacks['messaging']) {
        console.log('got messaging data', data.messaging)
        this.callbacks['messaging'](data.messaging)
        // TODO: figure out what this does
      }
    }
  }

  saveSessionStorage() {
    // TODO: should we really sync the linker server URL here?
    const walletData = {
      accounts: this.accounts,
      linked: this.linked, // TODO: implement
      lastMessageId: this.lastMessageId, // TODO: implement
      sessionToken: this.sessionToken
    }
    console.log('saving session storage:', walletData)
    sessionStorage.setItem(WALLET_LINKER_DATA, JSON.stringify(walletData))
  }

  loadSessionStorage() {
    const walletDataStr = sessionStorage.getItem(WALLET_LINKER_DATA)
    let walletData
    try {
      walletData = JSON.parse(walletDataStr)
    } catch(err) {
      console.error('error parsing session wallet data:', err)
      throw err
    }

    this.accounts = walletData.accounts
    this.sessionToken = walletData.sessionToken
    this.lastMessageId = walletData.lastMessageId
    this.linked = walletData.linked
  }

  getReturnUrl() {
    if (
      typeof window.orientation !== 'undefined' ||
      navigator.userAgent.indexOf('IEMobile') !== -1
    ) {
      return window.location.href
    } else {
      return ''
    }
  }

  async httpReq(method, path, body) {
    const url = `${this.httpUrl}${path}`
    const opts = {
      method,
      credentials: 'include',
      body: body && JSON.stringify(body),
      headers: { 'content-type': 'application/json' }
    }
    const resp = await fetch(url, opts)
    const json = await resp.json()
    console.log('json:', json)
    if (!resp.ok) {
      throw new Error(JSON.stringify(json))
    }
    return json
  }

  async post(url, body) {
    return await this.httpReq('POST', url, body)
  }
}

export default function Linker(opts) {
  return new MobileLinker(opts)
}
