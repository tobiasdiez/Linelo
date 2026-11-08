import MailError from '../mail/mail-error'
import type createAuth from './create-auth'

/**
 * Access tokens through Better Auth, which refreshes expired ones and stores
 * the rotated refresh token. Any failure to get one (the grant was revoked,
 * the refresh token expired, the token endpoint failed) asks the user to sign in again.
 */
function createTokenSource(auth: ReturnType<typeof createAuth>): Mail.TokenSource {
  /** Better Auth's answer: the stored token, refreshed when expired (or when `force` asks for it). */
  async function fetchToken(
    account: { id: string; userId: string },
    options: { force: boolean },
  ): Promise<string | undefined> {
    const body = { accountId: account.id, userId: account.userId }
    const tokens = options.force
      ? await auth.api.refreshToken({ body })
      : await auth.api.getAccessToken({ body })
    return tokens.accessToken
  }

  return {
    accessToken: async (account, options) => {
      const token = await fetchToken(account, options).catch((error: unknown) => {
        throw new MailError('reconnect', 'Getting an access token failed', { cause: error })
      })
      if (!token) {
        throw new MailError('reconnect', 'The account has no access token')
      }
      return token
    },
  }
}

export default createTokenSource
