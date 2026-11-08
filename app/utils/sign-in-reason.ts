import httpStatus from '#shared/utils/http-status'
import isRecord from '#shared/utils/is-record'

/**
 * Why an API call that failed with 401 sends the user to sign in: Linelo lost
 * access to the mailbox (`reason: 'reconnect'` from the server), or the session
 * ended. `undefined` for any other failure.
 */
function signInReason(error: unknown): Session.SignInReason | undefined {
  if (!isRecord(error) || error.statusCode !== httpStatus.unauthorized) {
    return undefined
  }
  // `data` is the response body, h3 puts the error's own data under `data` again
  const body = isRecord(error.data) ? error.data : {}
  const reason = isRecord(body.data) ? body.data.reason : undefined
  return reason === 'reconnect' ? 'reconnect' : 'expired'
}

export default signInReason
