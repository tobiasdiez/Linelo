import { createAuthClient } from 'better-auth/vue'

/** Better Auth's client, for the actions that start in the browser: signing in and out. */
const authClient = createAuthClient()

export default authClient
