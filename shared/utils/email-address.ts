/** The longest address SMTP allows (64 characters before the `@`, 255 after). */
const MAX_LENGTH = 320
/** Something before and after exactly one `@`, and no whitespace anywhere. */
const PLAUSIBLE = /^[^\s@]+@[^\s@]+$/

/**
 * Whether `value` looks like an email address the mail provider could deliver to.
 * Deliberately loose: the provider has the final word, this only catches typing
 * mistakes and malformed requests.
 */
function isPlausible(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_LENGTH && PLAUSIBLE.test(value)
}

const emailAddress = { isPlausible, maxLength: MAX_LENGTH }

export default emailAddress
