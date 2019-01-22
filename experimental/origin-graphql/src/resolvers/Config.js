import contracts from '../contracts'

export default {
  facebookAuthUrl: async () => {
    const bridgeServer = contracts.config.bridge
    if (!bridgeServer) {
      return { success: false }
    }
    const url = `${bridgeServer}/api/attestations/facebook/auth-url`
    const response = await fetch(url, {
      headers: { 'content-type': 'application/json' }
    })

    const data = await response.json()
    return data.url
  }
}
