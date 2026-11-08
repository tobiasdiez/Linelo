import createAuth from '../auth/create-auth'
import db from './db'

/*
 * The application's Better Auth instance (see `server/auth/create-auth.ts`),
 * configured from the environment:
 * BETTER_AUTH_SECRET signs sessions and encrypts OAuth tokens and BETTER_AUTH_URL
 * is the public origin, both required outside development;
 * MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET enable sign-in with Microsoft.
 */

function required(name: string, developmentDefault?: string): string | undefined {
  const value = process.env[name] || developmentDefault
  if (!value && !import.meta.dev) {
    throw new Error(`${name} is not set. Outside development Linelo needs it for sign-in.`)
  }
  return value
}

function microsoftCredentials() {
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    console.warn(
      'Sign-in with Microsoft is off: MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET are not set (see README).',
    )
    return undefined
  }
  return { clientId, clientSecret }
}

const auth = createAuth({
  db,
  baseURL: required('BETTER_AUTH_URL', import.meta.dev ? 'http://localhost:3000' : undefined),
  secret: required('BETTER_AUTH_SECRET'),
  microsoft: microsoftCredentials(),
  development: import.meta.dev,
})

export default auth
