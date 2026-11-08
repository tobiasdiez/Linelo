import MailError from './mail-error'

/** The provider refused the access token. `providerAuth.withToken` then refreshes it once and tries again. */
class ProviderUnauthorizedError extends Error {
  constructor(message = 'The mail provider refused the access token') {
    super(message)
    this.name = 'ProviderUnauthorizedError'
  }
}

/**
 * Calls the provider with the account's access token. When the provider refuses
 * it, refreshes the token once and calls again; refused again (revoked consent,
 * changed password, Conditional Access), the user has to sign in again.
 */
async function withToken<Result>(
  connection: Mail.Connection,
  call: (token: string) => Promise<Result>,
): Promise<Result> {
  try {
    return await call(await connection.accessToken())
  } catch (error) {
    if (!(error instanceof ProviderUnauthorizedError)) {
      throw error
    }
  }
  try {
    return await call(await connection.accessToken({ force: true }))
  } catch (error) {
    if (error instanceof ProviderUnauthorizedError) {
      throw new MailError('reconnect', 'The mail provider refused a freshly refreshed token', {
        cause: error,
      })
    }
    throw error
  }
}

const providerAuth = { withToken, UnauthorizedError: ProviderUnauthorizedError }

export default providerAuth
