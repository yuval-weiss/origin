const WALLET_LINKER_DATA = 'walletLinkerData'

class MobileLinker {
  constructor({ httpUrl, wsUrl }) {
    this.httpUrl = httpUrl
    this.portUrl = wsUrl
    this.sessionToken = null
    // code for linking via QR code
    this.linkCode = null
    this.accounts = []
  }

  linked() {
    return false
  }

  async link() {
    return await this.generateLinkCode()
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

export default function Linker({ httpUrl, wsUrl }) {
  return new MobileLinker({ httpUrl, wsUrl })
}
