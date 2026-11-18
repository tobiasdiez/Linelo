import emailAddress from '#shared/utils/email-address'
import participants from '#shared/utils/participants'

/** `Name <address>`, the way mail clients show a recipient. */
const NAMED_ADDRESS = /^(?<name>.*?)\s*<(?<address>[^<>]*)>$/
/** Quotes around a name, as in `"Weber, Jonas" <jonas@example.com>`. */
const SURROUNDING_QUOTES = /^"(?<inner>.*)"$/
/** A domain of dot-separated parts, as typed addresses have (`northwind.co`, not `northwind`). */
const DOTTED_DOMAIN = /@[^@.]+(?:\.[^@.]+)+$/

/**
 * The recipient typed into the forward field: an address, or `Name <address>`.
 * Without a name, the name of the thread participant with that address is used,
 * otherwise the address itself; a name too long to send is replaced by the address
 * (`participants.withSendableName`). `undefined` when the text is not an address.
 * Stricter than the server (`emailAddress.isPlausible`): a typed address needs a
 * dotted domain, which catches `name@company` typed in a hurry.
 */
function parseRecipient(
  text: string,
  known: readonly Inbox.Participant[] = [],
): Inbox.Participant | undefined {
  const trimmed = text.trim()
  const named = NAMED_ADDRESS.exec(trimmed)?.groups
  const email = (named?.address ?? trimmed).trim()
  if (!emailAddress.isPlausible(email) || !DOTTED_DOMAIN.test(email)) {
    return undefined
  }
  const typedName = (named?.name ?? '').trim()
  const name = (SURROUNDING_QUOTES.exec(typedName)?.groups?.inner ?? typedName).trim()
  const match = known.find(participant => participants.isSameAddress(participant, { name, email }))
  return participants.withSendableName({ name: name || match?.name || email, email })
}

export default parseRecipient
