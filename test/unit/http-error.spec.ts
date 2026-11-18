import { describe, expect, it } from 'vite-plus/test'
import MailError from '#server/mail/mail-error'
import httpErrorOf from '#server/mail/http-error'
import isConsentError from '~/utils/is-consent-error'
import isUncertain from '~/utils/is-uncertain'
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

/** How the app reads a failed call. */
function readByApp(error: unknown) {
  return {
    signIn: signInReason(error),
    consent: isConsentError(error),
    uncertain: isUncertain(error),
  }
}

describe('provider errors over HTTP', () => {
  it('asks the user to sign in again when the mailbox access is gone', () => {
    const error = httpErrorOf(new MailError('reconnect', 'grant revoked'))

    expect(error).toStrictEqual({
      statusCode: 401,
      statusMessage: 'Sign in again',
      data: { reason: 'reconnect' },
    })
    expect(readByApp(asReceived(error))).toStrictEqual({
      signIn: 'reconnect',
      consent: false,
      uncertain: false,
    })
  })

  it('reports an unavailable provider as 503, which keeps the user where they are', () => {
    const error = httpErrorOf(new MailError('unavailable', 'Graph is down'))

    expect(error).toStrictEqual({ statusCode: 503, statusMessage: 'Provider unavailable' })
    expect(readByApp(asReceived(error))).toStrictEqual({
      signIn: undefined,
      consent: false,
      uncertain: false,
    })
  })

  it('reports a missing permission as 403, so the page can ask for it', () => {
    const error = httpErrorOf(new MailError('consent', 'Calendars.ReadWrite missing'))

    expect(error).toStrictEqual({
      statusCode: 403,
      statusMessage: 'Permission missing',
      data: { reason: 'consent' },
    })
    expect(readByApp(asReceived(error))).toStrictEqual({
      signIn: undefined,
      consent: true,
      uncertain: false,
    })
  })

  it('reports a send the mailbox did not confirm as 504, so the app warns before sending again', () => {
    const error = httpErrorOf(new MailError('uncertain', 'Graph timed out'))

    expect(error).toStrictEqual({
      statusCode: 504,
      statusMessage: 'Not confirmed by the mailbox',
      data: { reason: 'uncertain' },
    })
    expect(readByApp(asReceived(error))).toStrictEqual({
      signIn: undefined,
      consent: false,
      uncertain: true,
    })
  })

  it('reports an account that is not one of the user’s mailboxes as 404', () => {
    expect(httpErrorOf(new MailError('unknownAccount', 'not hers'))).toStrictEqual({
      statusCode: 404,
      statusMessage: 'No such mail account',
    })
  })

  it.each([
    [
      'a 504 of a proxy with an HTML body',
      { statusCode: 504, data: '<html>Gateway Timeout</html>' },
    ],
    ['a plain 502', { statusCode: 502 }],
    ["Cloudflare's 524", { statusCode: 524, data: undefined }],
  ])('counts %s as unconfirmed, whatever it says', (_, error) => {
    expect({ uncertain: isUncertain(error) }).toStrictEqual({ uncertain: true })
  })

  it('counts nothing else as unconfirmed', () => {
    expect(
      [
        { statusCode: 500 },
        { statusCode: 503 },
        { statusCode: 401, data: { data: { reason: 'reconnect' } } },
        { statusCode: 403, data: { data: { reason: 'consent' } } },
        new Error('offline'),
        undefined,
      ].map(error => isUncertain(error)),
    ).toStrictEqual([false, false, false, false, false, false])
  })

  it('reads a plain 401 as an ended session, and so a reason it does not know', () => {
    expect(
      signInReason({
        statusCode: 401,
        data: { statusCode: 401, statusMessage: 'Not signed in' },
      }),
    ).toBe('expired')
    expect(signInReason({ statusCode: 401, data: { data: { reason: 'tired' } } })).toBe('expired')
  })
})
