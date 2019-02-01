import ZeroClientProvider from 'web3-provider-engine/zero'
import uuidv1 from 'uuid/v1'

const WALLET_LINKER_DATA = 'walletLinkerData'
const PLACEHOLDER_ADDRESS = '0x3f17f1962B36e491b30A40b2405849e597Ba5FB5'

class MobileLinker {
  constructor({ httpUrl, wsUrl, web3 }) {
    this.httpUrl = httpUrl
    this.portUrl = wsUrl
    this.sessionToken = null
    // code for linking via QR code
    this.linkCode = null
    this.linked = false
    console.log('1', this.web3)
    this.web3 = web3

    // provider stuff
    this.accounts = []
    this.callbacks = {}
    this.pendingCall = null
    this.netId = 999 // TODO: unhardcode this
  }

  linked() {
    return this.linked
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

  // Grabs link code, which is used to generate QR codes.
  async generateLinkCode() {
    console.log('generateLinkCode called')
    const resp = await this.post('/api/wallet-linker/generate-code', {
      session_token: this.sessionToken,
      returnUrl: this.getReturnUrl(),
      pending_call: null, // TODO: fill this in
      pub_key: null, // TODO; fill this in
      notify_wallet: this.notifyWallet
    })
    console.log('got link code response:', resp)
    this.linkCode = resp.link_code
    this.linked = resp.linked
    if (this.sessionToken !== resp.sessionToken) {
      this.sessionToken = resp.session_token
      // TODO: start message sync
    }
    this.saveSessionStorage()
    return resp.link_code
  }

  saveSessionStorage() {
    // TODO: should we really sync the linker server URL here?
    const walletData = {
      accounts: this.generateLinkCode.accounts,
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
