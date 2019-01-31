import { HttpLink } from 'apollo-link-http'
import {
  makeExecutableSchema,
  makeRemoteExecutableSchema,
  mergeSchemas,
  addMockFunctionsToSchema
} from 'graphql-tools'

import typeDefs from '../typeDefs/index'
import resolvers from '../resolvers/index'
import growthTypeDefs from '../typeDefs/Growth'

let growthSchema
if (process.env.GROWTH) {
  growthSchema = makeRemoteExecutableSchema({
    schema: makeExecutableSchema({ typeDefs: growthTypeDefs }),
    link: new HttpLink({ uri: 'http://localhost:3005/graphql', fetch })
  })
} else {
  growthSchema = makeExecutableSchema({ typeDefs: growthTypeDefs })
  addMockFunctionsToSchema({ schema: growthSchema, mocks: {
    DateTime: () => 'Date'
  } })
}

const schema = mergeSchemas({
  schemas: [growthSchema, makeExecutableSchema({ typeDefs, resolvers })]
})

export default schema
