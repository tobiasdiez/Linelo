import MailError from './mail-error'
import latestUnreadMessage from '#shared/utils/latest-unread-message'
import participants from '#shared/utils/participants'
import queueItemKey from '#shared/utils/queue-item-key'

/** The most threads one request may ask for, about five Graph batch rounds. */
const MAX_LIMIT = 20

/** `?limit=` as a whole number between 1 and 20; anything else asks for the most. */
function parseLimit(value: unknown): number {
  const limit = typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isInteger(limit) ? Math.min(Math.max(limit, 1), MAX_LIMIT) : MAX_LIMIT
}

/** One line on why the thread is shown, until ranking exists: newest unread first. */
function whyShown(thread: Inbox.Thread, mine: readonly Inbox.Participant[]): string {
  const message = latestUnreadMessage(thread)
  function includesMe(list: readonly Inbox.Participant[]): boolean {
    return list.some(entry => mine.some(address => participants.isSameAddress(entry, address)))
  }
  if (includesMe(message.to)) {
    return 'Unread and sent to you directly. Newest mail comes first.'
  }
  if (includesMe(message.cc)) {
    return 'Unread, with you in Cc. Newest mail comes first.'
  }
  return 'Unread in your inbox. Newest mail comes first.'
}

/** The thread of an account as the app sees it: its id made unique across accounts. */
function inAccount(thread: Mail.Thread, accountId: string): Inbox.Thread {
  return { ...thread, id: `${accountId}:${thread.id}`, accountId }
}

function toQueueItem(thread: Inbox.Thread, mine: readonly Inbox.Participant[]): Inbox.QueueItem {
  return { key: queueItemKey(thread), thread, whyShown: whyShown(thread, mine), suggestions: [] }
}

/**
 * Asks every mailbox for its unread threads in parallel and merges them, newest
 * unread first. A user without a mailbox (signed in, but mail access not granted)
 * has to sign in again rather than see an empty inbox.
 */
async function loadInbox(
  mailboxes: readonly Mail.Mailbox[],
  { limit }: { limit: number },
): Promise<Inbox.InboxResponse> {
  if (mailboxes.length === 0) {
    throw new MailError('reconnect', 'No mail account is connected')
  }
  const lists = await Promise.all(
    mailboxes.map(async ({ provider, connection }) => {
      const threads = await provider.listUnreadThreads(connection, { limit })
      return threads.map(thread => inAccount(thread, connection.account.id))
    }),
  )
  const mine = mailboxes.map(({ connection }) => connection.account.address)
  const items = lists
    .flat()
    .map(thread => toQueueItem(thread, mine))
    .toSorted(
      (first, second) =>
        Date.parse(latestUnreadMessage(second.thread).sentAt) -
        Date.parse(latestUnreadMessage(first.thread).sentAt),
    )
    .slice(0, limit)
  return { items }
}

/** The user's mail accounts as the app sees them. */
function accountsOf(mailboxes: readonly Mail.Mailbox[]): Inbox.MailAccount[] {
  return mailboxes.map(({ providerId, connection }) => ({
    id: connection.account.id,
    provider: providerId,
    address: connection.account.address,
  }))
}

const inbox = { load: loadInbox, parseLimit, accountsOf }

export default inbox
