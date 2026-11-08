import type { LocationQuery } from 'vue-router'

/** Microsoft's codes for "an admin has to consent first". */
const APPROVAL_CODES = ['AADSTS65001', 'AADSTS90094', 'AADSTS90095']

function first(value: LocationQuery[string] | undefined): string {
  const [entry] = Array.isArray(value) ? value : [value]
  return entry ?? ''
}

/**
 * Maps `?error=` and `error_description` (passed through by Better Auth from
 * Microsoft, or its own codes) and `?reason=` to a notice. `undefined` for a plain visit.
 */
function signInNotice(query: LocationQuery): Session.SignInNotice | undefined {
  const error = first(query.error)
  if (!error) {
    const reason = first(query.reason)
    return reason === 'reconnect' || reason === 'expired' ? reason : undefined
  }
  const description = first(query.error_description)
  if (error === 'consent_required' || APPROVAL_CODES.some(code => description.includes(code))) {
    return 'approval'
  }
  if (error === 'access_denied') {
    return 'cancelled'
  }
  // Better Auth's answer to a second identity with an email address that is already in use
  if (error === 'account_not_linked') {
    return 'taken'
  }
  return 'failed'
}

export default signInNotice
