import { createHmac, hkdfSync } from 'node:crypto'
import { Buffer } from 'node:buffer'

/** The HKDF label, so this key differs from anything else derived from the same secret. */
const LABEL = 'linelo/ranking/address-key/v1'
const KEY_BYTES = 32
/** Development without BETTER_AUTH_SECRET: a fixed key, like Better Auth's own fallback secret. */
const DEVELOPMENT_SECRET = 'linelo-development-address-key'
/** What is hashed to tell keys apart. */
const CHECK_INPUT = 'key-check'
const CHECK_LENGTH = 16

/**
 * Keys addresses for the index: HMAC-SHA-256 of the lower-cased address, with a key
 * derived from `secret` (BETTER_AUTH_SECRET) by HKDF. A leaked database then does not
 * show whom anyone writes to. Without a secret (development only), a fixed key.
 */
function createAddressKey(secret: string | undefined): Ranking.AddressKey {
  const key = Buffer.from(hkdfSync('sha256', secret || DEVELOPMENT_SECRET, '', LABEL, KEY_BYTES))
  function hmac(value: string): string {
    return createHmac('sha256', key).update(value).digest('base64url')
  }
  return {
    hash: address => hmac(address.trim().toLowerCase()),
    check: hmac(CHECK_INPUT).slice(0, CHECK_LENGTH),
  }
}

export default createAddressKey
