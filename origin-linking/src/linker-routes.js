import express from 'express'
import expressWs from 'express-ws'
import Linker from './logic/linker'

const router = express.Router()
//doing this is a hack for detached routers...
expressWs(router)

const CLIENT_TOKEN_COOKIE = 'ct'
const NOTIFY_TOKEN = process.env.NOTIFY_TOKEN

const getClientToken = req => {
  return req.cookies[CLIENT_TOKEN_COOKIE]
}

const clientTokenHandler = (res, clientToken) => {
  if (clientToken) {
    res.cookie(CLIENT_TOKEN_COOKIE, clientToken, {
      expires: new Date(Date.now() + 15 * 24 * 3600 * 1000),
      httpOnly: true
    })
  }
}

const linker = new Linker()

router.post('/generate-code', async (req, res) => {
  const _clientToken = getClientToken(req)
  const { clientToken, sessionToken, code, linked } = await linker.generateCode(
    _clientToken,
    req.body.session_token,
    req.body.pub_key,
    req.useragent,
    req.body.return_url,
    req.body.pending_call,
    req.body.notify_wallet
  )
  clientTokenHandler(res, clientToken)
  res.send({ session_token: sessionToken, link_code: code, linked })
})

router.get('/link-info/:code', async (req, res) => {
  const { code } = req.params
  // this is the context
  const { appInfo, linkId, pubKey } = await linker.getLinkInfo(code)
  res.send({ app_info: appInfo, link_id: linkId, pub_key: pubKey })
})

router.get('/server-info', (req, res) => {
  // this is the context
  const {
    providerUrl,
    contractAddresses,
    ipfsGateway,
    ipfsApi,
    messagingUrl,
    sellingUrl
  } = linker.getServerInfo()

  res.send({
    provider_url: providerUrl,
    contract_addresses: contractAddresses,
    ipfs_gateway: ipfsGateway,
    ipfs_api: ipfsApi,
    messaging_url: messagingUrl,
    selling_url: sellingUrl
  })
})

router.post('/call-wallet/:sessionToken', async (req, res) => {
  const clientToken = getClientToken(req)
  const { sessionToken } = req.params
  const success = await linker.callWallet(
    clientToken,
    sessionToken,
    req.body.account,
    req.body.call_id,
    req.body.call,
    req.body.return_url
  )
  res.send({ success })
})

router.post('/wallet-called/:walletToken', async (req, res) => {
  const { walletToken } = req.params
  const success = await linker.walletCalled(
    walletToken,
    req.body.call_id,
    req.body.link_id,
    req.body.session_token,
    req.body.result
  )
  res.send({ success })
})

router.post('/link-wallet/:walletToken', async (req, res) => {
  const { walletToken } = req.params
  const { linked, pendingCallContext, appInfo, linkId, linkedAt } = await linker.linkWallet(
    walletToken,
    req.body.code,
    req.body.current_rpc,
    req.body.current_accounts,
    req.body.priv_data
  )

  res.send({
    linked,
    pending_call_context: pendingCallContext,
    app_info: appInfo,
    link_id: linkId,
    linked_at: linkedAt
  })
})

router.post('/prelink-wallet/:walletToken', async (req, res) => {
  const { walletToken } = req.params
  const { code, linkId } = await linker.prelinkWallet(
    walletToken,
    req.body.pub_key,
    req.body.current_rpc,
    req.body.current_accounts,
    req.body.priv_data
  )

  res.send({ code, link_id: linkId })
})

router.post('/link-prelinked', async (req, res) => {
  const { clientToken, sessionToken, linked } = await linker.linkPrelinked(
    code,
    req.body.link_id,
    req.useragent,
    req.body.return_url
  )

  clientTokenHandler(res, clientToken)
  res.send({ session_token: sessionToken, linked })
})

router.get('/wallet-links/:walletToken', async (req, res) => {
  const { walletToken } = req.params
  const links = await linker.getWalletLinks(walletToken)
  res.send(links)
})


router.post('/wallet-update-links/:walletToken', async (req, res) => {
  const { walletToken } = req.params
  const { updates } = req.body
  const updateCount = await linker.updateWalletLinks(walletToken, updates)
  res.send({ updateCount })
})


router.post('/eth-notify', async (req, res) => {
  const { receivers, token } = req.body
  if (token == NOTIFY_TOKEN) {
    linker.ethNotify(receivers)
  }
  res.send(true)
})

router.post('/unlink', async (req, res) => {
  const clientToken = getClientToken(req)
  const success = await linker.unlink(clientToken)
  res.send(success)
})

router.post('/unlink-wallet/:walletToken', async (req, res) => {
  const { walletToken } = req.params
  const { link_id } = req.body
  const success = await linker.unlinkWallet(walletToken, link_id)
  res.send(success)
})

router.post('/register-wallet-notification/:walletToken', async (req, res) => {
  const { walletToken } = req.params
  const success = await linker.registerWalletNotification(
    walletToken,
    req.body.eth_address,
    req.body.device_type,
    req.body.device_token
  )
  res.send(success)
})


router.ws('/linked-messages/:sessionToken/:readId', async (ws, req) => {
  const clientToken = getClientToken(req)
  const { sessionToken, readId } = req.params
  //filter out sessionToken
  const realSessionToken = ['-', 'null', 'undefined'].includes(sessionToken) ? null : sessionToken

  logger.info(`Messages link sessionToken: ${sessionToken} clientToken: ${clientToken} readId: ${readId}`)

  if (!clientToken) {
    ws.close(1000, 'No client token available.')
    return
  }

  //this prequeues some messages before establishing the connection
  try {
    const closeHandler = await linker.handleSessionMessages(
      clientToken,
      realSessionToken,
      readId,
      (msg, msgId) => {
        ws.send(JSON.stringify({ msg, msgId }))
    })

    ws.on('close', closeHandler)
  } catch(error) {
    logger.error('We encountered an error: ' + error)
    ws.close(1000, error)
  }


})

router.ws('/wallet-messages/:walletToken/:readId', (ws, req) => {
  const { walletToken, readId } = req.params

  logger.info(`Wallet messages link walletToken: ${walletToken} readId:${readId}`)

  if (!walletToken) {
    ws.close()
  }

  const closeHandler = linker.handleMessages(walletToken, readId, (msg, msgId) => {
    ws.send(JSON.stringify({ msg, msgId }))
  })

  ws.on('close', closeHandler)
})

export default router
