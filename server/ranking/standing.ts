import participants from '#shared/utils/participants'

/** How many of the newest sent messages are scanned. */
const SENT_SCAN_SIZE = 500

/**
 * Whom the account writes to, from its sent messages: each address in To or Cc,
 * counted once per message, by its keyed hash. The owner's own address is left out.
 */
function correspondentsOf(
  sent: readonly Mail.SentEnvelope[],
  { owner, key }: { owner: Inbox.Participant; key: Ranking.AddressKey },
): Ranking.Correspondents {
  const correspondents: Ranking.Correspondents = {}
  for (const { to, cc, sentAt } of sent) {
    const recipients = participants
      .unique([...to, ...cc], [owner])
      .filter(entry => entry.email.length > 0)
    for (const recipient of recipients) {
      const hash = key.hash(recipient.email)
      const known = correspondents[hash]
      correspondents[hash] = {
        sent: (known?.sent ?? 0) + 1,
        lastSentAt:
          known && Date.parse(known.lastSentAt) > Date.parse(sentAt) ? known.lastSentAt : sentAt,
      }
    }
  }
  return correspondents
}

/** Scans Sent Items of the mailbox: its newest 500 messages, in one request. */
async function scan(
  { provider, connection }: Mail.Mailbox,
  key: Ranking.AddressKey,
): Promise<Ranking.Correspondents> {
  const sent = await provider.listSent(connection, { limit: SENT_SCAN_SIZE })
  return correspondentsOf(sent, { owner: connection.account.address, key })
}

const standing = { scan, correspondentsOf }

export default standing
