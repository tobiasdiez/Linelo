import emailAddress from './email-address'

function addressKey(participant: Inbox.Participant): string {
  return participant.email.toLowerCase()
}

/** Whether both participants have the same email address, ignoring case. */
function isSameAddress(first: Inbox.Participant, second: Inbox.Participant): boolean {
  return addressKey(first) === addressKey(second)
}

/** Participants in order of first appearance, without duplicates and without `excluded`. */
function unique(
  list: readonly Inbox.Participant[],
  excluded: readonly Inbox.Participant[] = [],
): Inbox.Participant[] {
  const seen = new Set(excluded.map(participant => addressKey(participant)))
  return list.filter(participant => {
    const key = addressKey(participant)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

/** The longest name a recipient may have, as long as an address may be; the server refuses longer ones. */
const MAX_NAME_LENGTH = emailAddress.maxLength

/** The participant with a name the server accepts: its address, when its name is longer than that. */
function withSendableName(participant: Inbox.Participant): Inbox.Participant {
  return participant.name.length > MAX_NAME_LENGTH
    ? { name: participant.email, email: participant.email }
    : participant
}

/**
 * The participants mail can be sent to, as the server accepts them: name-only
 * recipients, unknown senders and legacy Exchange addresses (`/o=ExchangeLabs/…`)
 * are left out, and a name too long to send is replaced by the address.
 */
function withAddress(list: readonly Inbox.Participant[]): Inbox.Participant[] {
  return list
    .filter(participant => emailAddress.isPlausible(participant.email))
    .map(participant => withSendableName(participant))
}

const participants = {
  isSameAddress,
  unique,
  withAddress,
  withSendableName,
  maxNameLength: MAX_NAME_LENGTH,
}

export default participants
