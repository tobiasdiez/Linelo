import participants from '#shared/utils/participants'
import timeWordsIn from './time-words'

/** What facts are taken relative to: whose mailbox it is, and the key for addresses. */
interface Context {
  owner: Inbox.Participant
  key: Ranking.AddressKey
}

/**
 * Changes whenever facts gain or change a signal: rows with facts of another version (or of
 * another key, see `factsCheck`) take their facts anew, without asking the judge again.
 */
const FACTS_VERSION = 1
/** Above this many characters a text is heavy (for interleaving). */
const HEAVY_TEXT_LENGTH = 1500
/** From this many recipients on a message is heavy. */
const HEAVY_RECIPIENTS = 6

/** Domains anyone can have an address at: the same one says nothing about an organisation. */
const PUBLIC_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.de',
  'gmx.net',
  'web.de',
  't-online.de',
  'posteo.de',
  'mailbox.org',
])

/** Local parts of addresses that no person reads: `no-reply`, `notifications+123`, `bounce-7`. */
const AUTOMATED_LOCAL_PART =
  /^(?:no-?reply|do-?not-?reply|notifications?|mailer-daemon|bounces?)(?:[-+._].*)?$/i

function domainOf(address: string): string {
  return address.slice(address.lastIndexOf('@') + 1).toLowerCase()
}

function localPartOf(address: string): string {
  return address.slice(0, Math.max(address.lastIndexOf('@'), 0))
}

/** How the message is addressed to its owner: alone in To, with others in To, in Cc, or not at all. */
function addressing(
  { to, cc }: Pick<Mail.Envelope, 'to' | 'cc'>,
  owner: Inbox.Participant,
): Ranking.Facts['addressing'] {
  function isOwner(entry: Inbox.Participant): boolean {
    return participants.isSameAddress(entry, owner)
  }
  if (to.some(entry => isOwner(entry))) {
    return to.every(entry => isOwner(entry)) ? 'alone' : 'withOthers'
  }
  return cc.some(entry => isOwner(entry)) ? 'cc' : 'none'
}

function sameOrganisation(from: Inbox.Participant, owner: Inbox.Participant): boolean {
  const domain = domainOf(from.email)
  return domain.length > 0 && domain === domainOf(owner.email) && !PUBLIC_DOMAINS.has(domain)
}

/** What the rules know about the message: no text, no address. */
function factsOf(envelope: Mail.Envelope, { owner, key }: Context): Ranking.Facts {
  const { from, marks } = envelope
  // The text where there is one; the preview otherwise
  const text = envelope.text || envelope.preview
  const recipients = envelope.to.length + envelope.cc.length
  return {
    ...marks,
    senderKey: key.hash(from.email),
    sameOrganisation: sameOrganisation(from, owner),
    addressing: addressing(envelope, owner),
    automatedAddress: AUTOMATED_LOCAL_PART.test(localPartOf(from.email)),
    timeWords: timeWordsIn(`${envelope.subject}\n${text}`),
    heavy: text.length > HEAVY_TEXT_LENGTH || recipients >= HEAVY_RECIPIENTS,
  }
}

/** Tells facts made with another key or of another version apart (`mailbox_profiles.factsCheck`). */
function factsCheck(key: Ranking.AddressKey): string {
  return `${key.check}/${FACTS_VERSION}`
}

const facts = { of: factsOf, addressing, domainOf, check: factsCheck }

export default facts
