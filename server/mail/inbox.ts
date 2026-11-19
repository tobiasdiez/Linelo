import guards from '#shared/utils/guards'

/** The most threads one request may ask for, about five Graph batch rounds. */
const MAX_LIMIT = 20

/** `?limit=` as a whole number between 1 and 20; anything else asks for the most. */
function parseLimit(value: unknown): number {
  const limit = typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isInteger(limit) ? Math.min(Math.max(limit, 1), MAX_LIMIT) : MAX_LIMIT
}

/** `?start=1` (or `true`) marks the first request of a session. */
function parseStart(value: unknown): boolean {
  return value === '1' || value === 'true'
}

/** Validates the body of `POST /api/inbox/sync`. */
function validateSync(body: unknown): Inbox.Validated<Inbox.SyncRequest> {
  return guards.validate<Inbox.SyncRequest>(body, { start: guards.boolean })
}

/** The user's mail accounts as the app sees them. */
function accountsOf(mailboxes: readonly Mail.Mailbox[]): Inbox.MailAccount[] {
  return mailboxes.map(({ providerId, connection }) => ({
    id: connection.account.id,
    provider: providerId,
    address: connection.account.address,
  }))
}

const inbox = { parseLimit, parseStart, validateSync, accountsOf }

export default inbox
