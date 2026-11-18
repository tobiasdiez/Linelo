import graphClient from './graph-client'

/**
 * The one Graph client of the server. The mail and calendar adapters both use it,
 * so their calls to the same mailbox wait in one queue (see `graph-client.ts`).
 */
const graph = graphClient.create({ fetch: globalThis.fetch })

export default graph
