import * as schema from '../db/schema'
import { betterAuth } from 'better-auth'
import type createDatabase from '../db/client'
import demoSignIn from './demo-sign-in'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import mailProviders from '../mail/providers'
import mailboxFromIdToken from './id-token-mailbox'

interface MicrosoftCredentials {
  clientId: string
  clientSecret: string
}

interface AuthOptions {
  db: ReturnType<typeof createDatabase>['db']
  /** The public origin, such as `http://localhost:3000`. */
  baseURL: string | undefined
  /** Signs sessions and encrypts OAuth tokens. Better Auth falls back to a fixed secret outside production. */
  secret: string | undefined
  /** Sign-in with Microsoft is off without them. */
  microsoft: MicrosoftCredentials | undefined
  /** Adds the demo mailbox sign-in. */
  development: boolean
}

function microsoftProvider(credentials: MicrosoftCredentials) {
  return {
    ...credentials,
    // Work, school and personal accounts
    tenantId: 'common',
    prompt: 'select_account' as const,
    // What the mail adapter needs on top of sign-in; `Mail.Send` comes with Reply
    scope: [...mailProviders.microsoft.mailScopes],
    disableProfilePhoto: true,
    // Some accounts have no `email` claim; their sign-in name is their address
    mapProfileToUser: (profile: { email?: string; preferred_username: string }) => ({
      email: profile.email ?? profile.preferred_username,
    }),
  }
}

/**
 * Takes the mailbox address and name from a new ID token, and leaves the token
 * itself unwritten: nothing else needs it, and Better Auth would store it unencrypted.
 */
function withMailbox(account: { idToken?: string | null }) {
  if (typeof account.idToken !== 'string') {
    return {}
  }
  return { ...mailboxFromIdToken(account.idToken), idToken: undefined }
}

/**
 * Sign-in, sessions and connected accounts through Better Auth, on the
 * application database. Its endpoints live under `/api/auth`.
 */
function createAuth({ db, baseURL, secret, microsoft: credentials, development }: AuthOptions) {
  return betterAuth({
    appName: 'Linelo',
    baseURL,
    secret,
    database: drizzleAdapter(db, { provider: 'pg', schema, usePlural: true, transaction: true }),
    advanced: { database: { generateId: 'uuid' } },
    user: { fields: { name: 'displayName' } },
    account: {
      encryptOAuthTokens: true,
      // Identity comes from the provider account, never from a matching email address:
      // Microsoft's email claim is not verified, so linking by email would allow takeovers
      accountLinking: { disableImplicitLinking: true },
      additionalFields: {
        mailboxAddress: { type: 'string', required: false, input: false },
        mailboxName: { type: 'string', required: false, input: false },
      },
    },
    databaseHooks: {
      account: {
        create: { before: account => Promise.resolve({ data: withMailbox(account) }) },
        update: { before: account => Promise.resolve({ data: withMailbox(account) }) },
      },
    },
    socialProviders: credentials ? { microsoft: microsoftProvider(credentials) } : {},
    plugins: development ? [demoSignIn] : [],
    // Failed sign-ins land on the sign-in page, which explains the `error` code
    onAPIError: { errorURL: '/sign-in' },
    telemetry: { enabled: false },
  })
}

export default createAuth
