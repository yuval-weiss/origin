const MigratableTokenContract = require('../build/contracts/MigratableToken.json')
const OriginTokenContract = require('../build/contracts/OriginToken.json')
const TokenMigrationContract = require('../build/contracts/TokenMigration.json')

const Web3 = require('web3')

async function deployOriginToken(initialSupply) {
  const web3 = new Web3('http://localhost:8545/')
  return await deployContract(web3, OriginTokenContract, [ initialSupply ])
}

async function deployTokenMigrationContract(oldToken, newToken) {
  const web3 = new Web3('http://localhost:8545/')
  return await deployContract(web3, TokenMigrationContract, [oldToken, newToken])
}

async function deployContract(web3, contractJson, args) {
  const [ from ] = await web3.eth.getAccounts()
  const contract = new web3.eth.Contract(contractJson.abi)
  const data = await contract.deploy({
    data: contractJson.bytecode,
    arguments: args
  }).encodeABI()
  const chainId = await web3.eth.net.getId()
  return await web3.eth
    .sendTransaction({
      data,
      from,
      value: 0,
      gas: 6000000,
      chainId
    })
}

async function migrateBalances(web3, oldTokenAddress, newTokenAddress) {
  const [ from ] = await web3.eth.getAccounts()

  const oldToken = new web3.eth.Contract(
    MigratableTokenContract.abi,
    oldTokenAddress
  )
  if (!await oldToken.methods.paused().call()) {
    console.log('Pausing old token')
    await oldToken.methods.pause().send({from})
  }

  const newToken = new web3.eth.Contract(
    MigratableTokenContract.abi,
    newTokenAddress
  )
  if (!await newToken.methods.paused().call()) {
    console.log('Pausing new token')
    await newToken.methods.pause().send({from})
  }

  // Grab all possible account holders using the ERC20 Transfer event, which
  // is logged for all token transfers.
  const transferEvent = MigratableTokenContract.abi.filter(
    x => x.name === 'Transfer' && x.type === 'event'
  )[0]
  const transferEvents = await oldToken.getPastEvents('Transfer', {
    fromBlock: web3.utils.toHex(0), // TODO: add blockEpoch
    toBlock: 'latest'
  })
  const accountHolders = Array.from(new Set([
    ...transferEvents.map(e => e.returnValues.from),
    ...transferEvents.map(e => e.returnValues.to)
  ]))

  // Get all accounts with non-zero balances that haven't already been migrated.
  const possibleAccounts = await Promise.all(
    accountHolders.map(async account => {
      const oldBalance = await oldToken.methods.balanceOf(account).call()
      return (
        oldBalance > 0 &&
        oldBalance != await newToken.methods.balanceOf(account).call()
      ) ? account : null
    })
  )
  const accountsToMigrate = possibleAccounts.filter(a => a !== null)
  console.log('accounts to migrate:', accountsToMigrate.length)

  // Deploy token migration contract and transfer token contract ownership to
  // it.
  // TODO: allow existing address to be passed in, to resume migration
  console.log('Deploying token migration contract')
  const { contractAddress } = await deployTokenMigrationContract(
    oldTokenAddress,
    newTokenAddress
  )
  const TokenMigration = new web3.eth.Contract(
    TokenMigrationContract.abi,
    contractAddress
  )
  // TODO: handle resume, where token ownership already transferred
  console.log('tranferring ownership')
  await newToken.methods.transferOwnership(TokenMigration._address).send({ from })

  // Migrate accounts in batches
  console.log('migrating')
  const batchSize = 20
  for (let i = 0; i < accountsToMigrate.length; i += batchSize) {
    const batch = accountsToMigrate.slice(i, i + batchSize)

    const txn = TokenMigration.methods.migrateAccounts(batch)
    const gas = await txn.estimateGas({ from })
    console.log(`estimated gas ${gas} for migration of [ ${batch} ]`)
    await txn.send({ from, gas })
    console.log('migrated', batch)
  }

  await TokenMigration.methods.finish(from).send({ from })
  console.log('migration finished')
}

(async function() {
  const { contractAddress: oldTokenAddress } = await deployOriginToken(1000)
  const { contractAddress: newTokenAddress } = await deployOriginToken(0)

  // test code, TODO: remove
  const web3 = new Web3('http://localhost:8545/')
  const accounts = await web3.eth.getAccounts()
  const OldToken = new web3.eth.Contract(OriginTokenContract.abi, oldTokenAddress)
  for (let i = 1; i < accounts.length; i++) {
    await OldToken.methods.transfer(accounts[i], 11 * i).send({from: accounts[0]})
  }

  migrateBalances(web3, oldTokenAddress, newTokenAddress)
    .then(() => process.exit(0))
    .catch(e => {console.error(e); process.exit(1) })
})()
