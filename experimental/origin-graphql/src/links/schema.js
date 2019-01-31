import { HttpLink } from 'apollo-link-http'
import {
  makeExecutableSchema,
  makeRemoteExecutableSchema,
  mergeSchemas
} from 'graphql-tools'

import typeDefs from '../typeDefs/index'
import resolvers from '../resolvers/index'
import growthTypeDefs from '../typeDefs/Growth'

const growthSchema = makeExecutableSchema({
  typeDefs: growthTypeDefs
})

const schema = mergeSchemas({
  schemas: [
    makeRemoteExecutableSchema({
      schema: growthSchema,
      link: new HttpLink({ uri: 'http://localhost:3005/graphql', fetch })
    }),
    makeExecutableSchema({ typeDefs, resolvers })
  ]
})

export default schema
