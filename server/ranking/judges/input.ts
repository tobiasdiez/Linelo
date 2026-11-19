import facts from '../facts'
import participants from '#shared/utils/participants'

/*
 * What a judge is shown of a message. Its wording is part of what the judge answers: a
 * change here bumps the questions' version of each judge (`QUESTIONS_VERSION` in `jev.ts`).
 */

function others(count: number): string {
  return count === 1 ? '1 other' : `${count} others`
}

/** How the message is addressed, as a phrase: "to the reader alone, 2 others in Cc". */
function addressedPhrase(envelope: Mail.Envelope, owner: Inbox.Participant): string {
  function notOwner(entry: Inbox.Participant): boolean {
    return !participants.isSameAddress(entry, owner)
  }
  const toOthers = envelope.to.filter(entry => notOwner(entry)).length
  const ccOthers = envelope.cc.filter(entry => notOwner(entry)).length
  // To nobody by name: undisclosed recipients, as many newsletters are sent
  const toWhom = toOthers === 0 ? 'to nobody by name' : `to ${others(toOthers)}`
  const phrases: Record<Ranking.Facts['addressing'], string> = {
    alone: 'to the reader alone',
    withOthers: `to the reader and ${others(toOthers)}`,
    cc: `${toWhom}, the reader in Cc`,
    none: `${toWhom}, not to the reader`,
  }
  const main = phrases[facts.addressing(envelope, owner)]
  return ccOthers > 0 ? `${main}, ${others(ccOthers)} in Cc` : main
}

/**
 * What the judge is shown: the reader's name, the sender's name (never an address) and
 * domain, how the mail is addressed, the subject and the message's own complete text.
 */
function judgeInput(envelope: Mail.Envelope, owner: Inbox.Participant): Ranking.JudgeInput {
  const { from } = envelope
  return {
    reader: owner.name,
    // A name that is an address stays home
    from: {
      name: from.name.includes('@') ? '' : from.name,
      domain: facts.domainOf(from.email),
    },
    addressed: addressedPhrase(envelope, owner),
    subject: envelope.subject,
    text: envelope.text || envelope.preview,
  }
}

export default judgeInput
