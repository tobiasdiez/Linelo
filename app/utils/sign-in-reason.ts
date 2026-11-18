import httpStatus from '#shared/utils/http-status'
import reasonOf from './reason-of'

/**
 * Why an API call that failed with 401 sends the user to sign in: Linelo lost
 * access to the mailbox (`reason: 'reconnect'` from the server), or the session
 * ended. `undefined` for any other failure.
 */
function signInReason(error: unknown): Session.SignInReason | undefined {
  const { status, reason } = reasonOf(error)
  if (status !== httpStatus.unauthorized) {
    return undefined
  }
  return reason === 'reconnect' ? 'reconnect' : 'expired'
}

export default signInReason
