import type MailError from './mail-error'
import httpStatus from '#shared/utils/http-status'

/** What `createError` gets for a failed mail call. */
interface HttpErrorInput {
  statusCode: number
  statusMessage: string
  /**
   * The client reads `reason` to tell "sign in again" from "session ended"
   * (`app/utils/sign-in-reason.ts`), a missing permission from other refusals
   * (`app/utils/is-consent-error.ts`), and a send that may have gone out from one
   * that surely did not (`app/utils/is-uncertain.ts`).
   */
  data?: { reason: Inbox.ApiErrorReason }
}

/**
 * The HTTP answer to a failed provider call: 401 with `reason: 'reconnect'` (sign in
 * again), 403 with `reason: 'consent'` (a permission is missing, such as calendar
 * access), 504 with `reason: 'uncertain'` (the provider did not confirm a send, the
 * mail may be out), 404 for an account that is not one of the user's mailboxes, or
 * 503 (nothing happened, try again).
 */
function httpErrorOf(error: MailError): HttpErrorInput {
  switch (error.kind) {
    case 'reconnect': {
      return {
        statusCode: httpStatus.unauthorized,
        statusMessage: 'Sign in again',
        data: { reason: 'reconnect' },
      }
    }
    case 'consent': {
      return {
        statusCode: httpStatus.forbidden,
        statusMessage: 'Permission missing',
        data: { reason: 'consent' },
      }
    }
    case 'uncertain': {
      return {
        statusCode: httpStatus.gatewayTimeout,
        statusMessage: 'Not confirmed by the mailbox',
        data: { reason: 'uncertain' },
      }
    }
    case 'unknownAccount': {
      return { statusCode: httpStatus.notFound, statusMessage: 'No such mail account' }
    }
    case 'unavailable': {
      return { statusCode: httpStatus.serviceUnavailable, statusMessage: 'Provider unavailable' }
    }
    default: {
      // Every kind has its answer above; a new one fails to compile here
      throw new Error(`No HTTP answer for mail error kind ${String(error.kind satisfies never)}`)
    }
  }
}

export default httpErrorOf
