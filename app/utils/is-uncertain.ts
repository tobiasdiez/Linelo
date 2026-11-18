import httpStatus from '#shared/utils/http-status'
import reasonOf from './reason-of'

/** Cloudflare's "a timeout occurred": the origin took too long to answer. */
const PROXY_TIMEOUT = 524
/**
 * Answers of a proxy or the platform in front of the server when it did not hear
 * back in time, whatever their body: the server may have sent the mail meanwhile.
 */
const NO_CONFIRMATION: ReadonlySet<unknown> = new Set([
  httpStatus.badGateway,
  httpStatus.gatewayTimeout,
  PROXY_TIMEOUT,
])

/**
 * Whether a failed reply or forward may still have gone out: the server says the
 * mailbox did not confirm it (504 with `reason: 'uncertain'`, see `server/mail/http-error.ts`),
 * or a proxy in front of the server gave up waiting (502, 504, 524), whatever the
 * body says. The user should check Sent Items before sending again.
 */
function isUncertain(error: unknown): boolean {
  const { status, reason } = reasonOf(error)
  return reason === 'uncertain' || NO_CONFIRMATION.has(status)
}

export default isUncertain
