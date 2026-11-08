/// <reference types="node" />
import * as schema from '#server/db/schema'
import { describe, expect, it, onTestFinished, vi } from 'vite-plus/test'
import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto'
import { Buffer } from 'node:buffer'
import type { GenericEndpointContext } from 'better-auth'
import createAuth from '#server/auth/create-auth'
import createTokenSource from '#server/auth/token-source'
import { eq } from 'drizzle-orm'
import { handleOAuthUserInfo } from 'better-auth/oauth2'
import httpStatus from '#shared/utils/http-status'
import testDatabase from './test-database'

const SECRET = 'test-secret-that-is-long-enough-for-better-auth'
const HOUR = 3_600_000
const SECONDS_PER_HOUR = 3600
const TOKEN_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

/** An unsigned JWT with these claims; only its payload is read. */
function idToken(claims: Record<string, unknown>): string {
  return `${base64url({ alg: 'none' })}.${base64url(claims)}.`
}

/** Stands in for Microsoft's token endpoint for the rest of the test. */
function fakeTokenEndpoint(answer: () => Response) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => answer())
  vi.stubGlobal('fetch', fetch)
  onTestFinished(() => {
    vi.unstubAllGlobals()
  })
  return fetch
}

/** Better Auth on a fresh database, with a Microsoft account like the OAuth callback stores it. */
async function setup() {
  const database = await testDatabase()
  const auth = createAuth({
    db: database.db,
    baseURL: 'http://localhost:3000',
    secret: SECRET,
    microsoft: { clientId: 'client', clientSecret: 'secret' },
    development: true,
  })
  const context = await auth.$context
  const { user, account } = await context.internalAdapter.createOAuthUser(
    { name: 'Mara Lindqvist', email: 'mara@northwind.co', emailVerified: false },
    {
      providerId: 'microsoft',
      accountId: 'microsoft-oid',
      accessToken: await symmetricEncrypt({ key: SECRET, data: 'stored-access-token' }),
      refreshToken: await symmetricEncrypt({ key: SECRET, data: 'stored-refresh-token' }),
      accessTokenExpiresAt: new Date(Date.now() + HOUR),
      scope: 'openid,profile,email,offline_access,User.Read,Mail.ReadWrite',
      idToken: idToken({ preferred_username: 'mara@northwind.co', name: 'Mara L.' }),
    },
  )
  async function storedAccount(id = account.id) {
    const [row] = await database.db.select().from(schema.accounts).where(eq(schema.accounts.id, id))
    return row
  }
  function accessToken(force: boolean) {
    return createTokenSource(auth).accessToken({ id: account.id, userId: user.id }, { force })
  }
  return { auth, context, database, user, account, storedAccount, accessToken }
}

/** What the OAuth callback hands over for a Microsoft sign-in, after Microsoft answered. */
function microsoftSignIn(oid: string, claims: Record<string, unknown>) {
  return {
    userInfo: { id: oid, name: 'Mara Lindqvist', email: 'mara@northwind.co', emailVerified: false },
    account: {
      providerId: 'microsoft',
      accountId: oid,
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      idToken: idToken(claims),
    },
    callbackURL: '/',
  }
}

/** The part of an endpoint context the OAuth sign-in reads. */
function endpointContext(context: Awaited<ReturnType<typeof setup>>['context']) {
  // The sign-in only reads `context` outside a request; a whole endpoint context needs a running endpoint
  // eslint-disable-next-line typescript/no-unsafe-type-assertion
  return { context } as unknown as GenericEndpointContext
}

describe('better auth on the application database', () => {
  it('writes users and accounts to our tables, with uuid ids and our column names', async () => {
    expect.hasAssertions()
    const { database, user, storedAccount } = await setup()

    await expect(
      database.db.select({ name: schema.users.displayName }).from(schema.users),
    ).resolves.toStrictEqual([{ name: 'Mara Lindqvist' }])
    expect(user.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-/)
    await expect(storedAccount()).resolves.toMatchObject({
      userId: user.id,
      providerId: 'microsoft',
    })
  })

  it('takes the mailbox from the ID token and does not keep the token', async () => {
    expect.hasAssertions()
    const { storedAccount } = await setup()

    const stored = await storedAccount()

    expect(stored).toMatchObject({ mailboxAddress: 'mara@northwind.co', mailboxName: 'Mara L.' })
    expect(stored?.idToken).toBeNull()
  })

  it('updates the mailbox when the account signs in again', async () => {
    expect.hasAssertions()
    const { context, storedAccount } = await setup()

    const result = await handleOAuthUserInfo(
      endpointContext(context),
      microsoftSignIn('microsoft-oid', { email: 'mara@work.example', name: 'Mara Lindqvist' }),
    )
    const stored = await storedAccount()

    expect(result.error).toBeNull()
    expect(stored).toMatchObject({
      mailboxAddress: 'mara@work.example',
      mailboxName: 'Mara Lindqvist',
    })
    expect(stored?.idToken).toBeNull()
    await expect(symmetricDecrypt({ key: SECRET, data: stored?.accessToken ?? '' })).resolves.toBe(
      'new-access-token',
    )
  })

  it('does not merge a second Microsoft identity with the same email address', async () => {
    expect.hasAssertions()
    const { context, database } = await setup()

    const result = await handleOAuthUserInfo(
      endpointContext(context),
      microsoftSignIn('other-oid', { email: 'mara@northwind.co' }),
    )

    expect(result.error).toBe('account not linked')
    await expect(database.db.select().from(schema.accounts)).resolves.toHaveLength(1)
  })

  it('takes the sign-in name as the email address when Microsoft sends none', async () => {
    expect.hasAssertions()
    const { context } = await setup()
    const microsoft = context.socialProviders.find(provider => provider.id === 'microsoft')

    const info = await microsoft?.getUserInfo({
      idToken: idToken({ oid: 'oid', preferred_username: 'mara@work.example', name: 'Mara' }),
    })

    expect(info?.user.email).toBe('mara@work.example')
  })

  it('asks Microsoft for mail access, a refresh token and the account picker', async () => {
    expect.hasAssertions()
    const { auth } = await setup()

    const { url } = await auth.api.signInSocial({
      body: { provider: 'microsoft', callbackURL: '/' },
    })
    const query = new URL(url ?? '').searchParams

    expect(query.get('scope')?.split(' ')).toStrictEqual(
      expect.arrayContaining(['Mail.ReadWrite', 'offline_access']),
    )
    expect(query.get('prompt')).toBe('select_account')
  })

  it('hands out the stored access token, decrypted', async () => {
    expect.hasAssertions()
    const { accessToken } = await setup()

    await expect(accessToken(false)).resolves.toBe('stored-access-token')
  })

  it('refreshes on demand and stores the rotated tokens encrypted', async () => {
    expect.hasAssertions()
    const { accessToken, storedAccount } = await setup()
    const tokenEndpoint = fakeTokenEndpoint(() =>
      Response.json({
        access_token: 'fresh-access-token',
        refresh_token: 'rotated-refresh-token',
        expires_in: SECONDS_PER_HOUR,
        token_type: 'Bearer',
      }),
    )

    await expect(accessToken(true)).resolves.toBe('fresh-access-token')

    const stored = await storedAccount()
    expect(
      tokenEndpoint.mock.calls.map(([url]) => (url instanceof Request ? url.url : url.toString())),
    ).toStrictEqual([TOKEN_ENDPOINT])
    expect(stored?.refreshToken).not.toContain('rotated')
    await expect(symmetricDecrypt({ key: SECRET, data: stored?.refreshToken ?? '' })).resolves.toBe(
      'rotated-refresh-token',
    )
  })

  it.each([
    ['Microsoft rejects the refresh token', httpStatus.badRequest],
    ['the token endpoint is down', httpStatus.serviceUnavailable],
  ])('asks to sign in again when %s', async (_, status) => {
    expect.hasAssertions()
    const { accessToken } = await setup()
    fakeTokenEndpoint(() => Response.json({ error: 'invalid_grant' }, { status }))

    await expect(accessToken(true)).rejects.toMatchObject({ kind: 'reconnect' })
  })

  it('signs in to the demo mailbox in development', async () => {
    expect.hasAssertions()
    const { auth } = await setup()

    const response = await auth.handler(new Request('http://localhost:3000/api/auth/demo/sign-in'))
    const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? ''
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) })

    expect(response.headers.get('location')).toBe('/')
    expect(session?.user).toMatchObject({
      name: 'Mara Lindqvist',
      email: 'mara.lindqvist@northwind.co',
    })
  })
})
