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

const participants = { isSameAddress, unique }

export default participants
