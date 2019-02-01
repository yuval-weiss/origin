module.exports = `
  extend type Query {
    walletLinker: WalletLinker
  }

  type WalletLinker {
    linkCode: String
    linked: Boolean
  }

  extend type Mutation {
    createLinkCode: String
  }
`
