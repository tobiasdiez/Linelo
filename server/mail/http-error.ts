import type MailError from './mail-error'
import httpStatus from '#shared/utils/http-status'

/** What `createError` gets for a failed mail call. */
interface HttpErrorInput {
  statusCode: number
  statusMessage: string
  /** The client reads `reason` to tell "sign in again" from "session ended" (`app/utils/sign-in-reason.ts`). */
  data?: { reason: 'reconnect' }
}

/** The HTTP answer to a failed mail call: 401 with `reason: 'reconnect'` (sign in again), or 503. */
function httpErrorOf(error: MailError): HttpErrorInput {
  return error.kind === 'reconnect'
    ? {
        statusCode: httpStatus.unauthorized,
        statusMessage: 'Sign in again',
        data: { reason: 'reconnect' },
      }
    : { statusCode: httpStatus.serviceUnavailable, statusMessage: 'Mailbox unavailable' }
}

export default httpErrorOf
