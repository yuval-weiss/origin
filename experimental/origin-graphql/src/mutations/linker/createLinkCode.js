import contracts from '../../contracts'

async function createLinkCode() {
  return await contracts.linker.generateLinkCode()
}

export default createLinkCode
