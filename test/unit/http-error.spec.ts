import { describe, expect, it } from 'vite-plus/test'
import MailError from '#server/mail/mail-error'
import httpErrorOf from '#server/mail/http-error'
import signInReason from '~/utils/sign-in-reason'

/**
 * The error `$fetch` raises in the app for such an answer: Nitro sends the error
 * as JSON (`{ url, statusCode, statusMessage, message, data }`), and ofetch puts
 * that body under `data`.
 */
function asReceived(error: ReturnType<typeof httpErrorOf>) {
  const body = { url: '/api/inbox', ...error, message: error.statusMessage }
  return { statusCode: error.statusCode, data: body }
}

describe('mail errors over HTTP', () => {
  it('asks the user to sign in again when the mailbox access is gone', () => {
    const error = httpErrorOf(new MailError('reconnect', 'grant revoked'))

    expect(error).toStrictEqual({
      statusCode: 401,
      statusMessage: 'Sign in again',
      data: { reason: 'reconnect' },
    })
    expect(signInReason(asReceived(error))).toBe('reconnect')
  })

  it('reports an unavailable mailbox as 503, which keeps the user where they are', () => {
    const error = httpErrorOf(new MailError('unavailable', 'Graph is down'))

    expect(error).toStrictEqual({ statusCode: 503, statusMessage: 'Mailbox unavailable' })
    expect(signInReason(asReceived(error))).toBeUndefined()
  })

  it('reads a plain 401 as an ended session', () => {
    expect(
      signInReason({ statusCode: 401, data: { statusCode: 401, statusMessage: 'Not signed in' } }),
    ).toBe('expired')
  })
})
