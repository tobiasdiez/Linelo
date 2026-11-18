import createDemoProvider from './demo'
import createMicrosoftProvider from './microsoft'
import graph from '../../microsoft/graph'

/** The mail adapters, keyed by the provider id of the accounts they serve. */
const mailProviders = {
  microsoft: createMicrosoftProvider({ graph }),
  // The demo mailbox exists in development only (see `server/auth/demo-sign-in.ts`)
  ...(import.meta.dev ? { demo: createDemoProvider() } : {}),
} satisfies Record<string, Mail.Provider>

export default mailProviders
