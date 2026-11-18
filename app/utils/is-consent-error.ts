import httpStatus from '#shared/utils/http-status'
import reasonOf from './reason-of'

/**
 * Whether a failed API call says Linelo lacks a permission (403 with `reason: 'consent'`,
 * see `server/mail/http-error.ts`), such as calendar access: the page asks to allow it.
 */
function isConsentError(error: unknown): boolean {
  const { status, reason } = reasonOf(error)
  return status === httpStatus.forbidden && reason === 'consent'
}

export default isConsentError
