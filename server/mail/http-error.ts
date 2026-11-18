import type MailError from './mail-error'
import httpStatus from '#shared/utils/http-status'

/** What `createError` gets for a failed mail call. */
interface HttpErrorInput {
  statusCode: number
  statusMessage: string
  /**
   * The client reads `reason` to tell "sign in again" from "session ended" (`app/utils/sign-in-reason.ts`),
   * and a missing permission from other refusals (`app/utils/is-consent-error.ts`).
   */
  data?: { reason: 'reconnect' | 'consent' }
}

/**
 * The HTTP answer to a failed provider call: 401 with `reason: 'reconnect'` (sign in again),
 * 403 with `reason: 'consent'` (a permission is missing, such as calendar access), or 503.
 */
function httpErrorOf(error: MailError): HttpErrorInput {
  if (error.kind === 'reconnect') {
    return {
      statusCode: httpStatus.unauthorized,
      statusMessage: 'Sign in again',
      data: { reason: 'reconnect' },
    }
  }
  if (error.kind === 'consent') {
    return {
      statusCode: httpStatus.forbidden,
      statusMessage: 'Permission missing',
      data: { reason: 'consent' },
    }
  }
  return { statusCode: httpStatus.serviceUnavailable, statusMessage: 'Provider unavailable' }
}

export default httpErrorOf
