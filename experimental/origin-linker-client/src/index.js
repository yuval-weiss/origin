class MobileLinker {
  constructor({ httpUrl, wsUrl }) {
    this.httpUrl = httpUrl
    this.portUrl = wsUrl
    console.log(httpUrl, wsUrl)
  }

  async link() {
    const code = await this.generateLinkCode()
    console.log(code)
    return code
  }

  async generateLinkCode() {
    console.log('generateLinkCode called')
    const resp = await this.post('/api/wallet-linker/generate-code', {
      session_token: this.sessionToken,
      returnUrl: this.getReturnUrl(),
      pending_call: null, // TODO: fill this in
      pub_key: null, // TODO; fill this in
      notify_wallet: this.notifyWallet
    })
    this.linkCode = resp.link_code
    this.linked = resp.linked
    if (this.sessionToken !== resp.sessionToken) {
      this.sessionToken = resp.sessionToken
      // TODO; start message sync
    }
    // TODO: sync session storage
    return resp.link_code
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
