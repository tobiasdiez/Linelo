import { Buffer } from 'node:buffer'
import isRecord from '#shared/utils/is-record'

interface MailboxFields {
  mailboxAddress: string
  mailboxName: string
}

/** The claims of a JWT, unverified: the ID token came straight from the provider's token endpoint. */
function claims(idToken: string): Record<string, unknown> | undefined {
  const [, payload] = idToken.split('.')
  if (!payload) {
    return undefined
  }
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return isRecord(decoded) ? decoded : undefined
  } catch {
    return undefined
  }
}

function claim(values: Record<string, unknown>, name: string): string | undefined {
  const value = values[name]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * The mailbox address and name from an OpenID ID token: `email`, else
 * `preferred_username` (Microsoft's sign-in name, usually the address), and `name`.
 */
function mailboxFromIdToken(idToken: string): MailboxFields | undefined {
  const values = claims(idToken)
  const address = values && (claim(values, 'email') ?? claim(values, 'preferred_username'))
  if (!values || !address) {
    return undefined
  }
  return { mailboxAddress: address, mailboxName: claim(values, 'name') ?? address }
}

export default mailboxFromIdToken
