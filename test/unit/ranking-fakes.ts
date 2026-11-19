import * as schema from '#server/db/schema'
import calendarTime from '#shared/utils/calendar-time'
import createAddressKey from '#server/ranking/address-key'
import mailFakes from './mail-fakes'
import mailboxOwner from '#shared/data/mailbox-owner'
import sync from '#server/ranking/sync'
import testDatabase from './test-database'
import { vi } from 'vite-plus/test'

/*
 * Stand-ins for the ranking specs: a database with mail accounts, a mailbox whose unread
 * mail is a list of envelopes, envelopes, and a judge.
 */

const NOW = new Date('2026-10-12T10:30:00Z')
const MS_PER_HOUR = calendarTime.MILLISECONDS_PER_HOUR
const lena: Inbox.Participant = { name: 'Lena Hartmann', email: 'lena.hartmann@northwind.co' }
const key = createAddressKey('test-secret-for-the-address-key')
/** The database's null, for expectations. */
// eslint-disable-next-line unicorn/no-null
const NONE = null

/** An answer that asks the reader something, without time pressure. */
const ASKS: Ranking.Answers = {
  asksMe: 0.9,
  automated: 0.05,
  timePressure: { score: 1, confidence: 0.8 },
}

function hoursAgo(hours: number, now: Date = NOW): string {
  return new Date(now.getTime() - hours * MS_PER_HOUR).toISOString()
}

/** A fresh database with a user and `count` Microsoft accounts; resolves to it and the accounts' ids. */
async function rankingDatabase(count = 1) {
  const database = await testDatabase()
  const [user] = await database.db
    .insert(schema.users)
    .values({ email: mailboxOwner.email, displayName: mailboxOwner.name })
    .returning({ id: schema.users.id })
  if (!user) {
    throw new Error('No user was created')
  }
  const accounts = await database.db
    .insert(schema.accounts)
    .values(
      Array.from({ length: count }, (_, index) => ({
        userId: user.id,
        providerId: 'microsoft',
        accountId: `oid-${index}`,
      })),
    )
    .returning({ id: schema.accounts.id })
  return { db: database.db, accountIds: accounts.map(account => account.id) }
}

/** An unread message as a provider lists it, sent to the mailbox owner alone an hour ago unless told otherwise. */
function envelope(id: string, overrides: Partial<Mail.Envelope> = {}): Mail.Envelope {
  return {
    id,
    threadId: `thread-${id}`,
    from: lena,
    to: [mailboxOwner],
    cc: [],
    subject: `Subject of ${id}`,
    receivedAt: hoursAgo(1),
    preview: '',
    text: 'Hello Mara.',
    marks: { unsubscribable: false, importance: 'normal', flagged: false, sorting: 'focused' },
    ...overrides,
  }
}

function newestFirst(first: { receivedAt: string }, second: { receivedAt: string }): number {
  return Date.parse(second.receivedAt) - Date.parse(first.receivedAt)
}

function toMessage(entry: Mail.Envelope): Inbox.Message {
  return {
    id: entry.id,
    from: entry.from,
    replyTo: [],
    to: entry.to,
    cc: entry.cc,
    sentAt: entry.receivedAt,
    body: entry.text,
    attachments: [],
    unread: true,
  }
}

/** The threads of these conversations from the unread envelopes; those with none are finished. */
function threadsOf(
  unread: readonly Mail.Envelope[],
  threadIds: readonly string[],
): Mail.LoadedThreads {
  const loaded: Mail.LoadedThreads = { threads: [], finished: [] }
  for (const threadId of threadIds) {
    const [first, ...rest] = unread
      .filter(entry => entry.threadId === threadId)
      .toSorted((one, other) => -newestFirst(one, other))
      .map(entry => toMessage(entry))
    if (first) {
      loaded.threads.push({ id: threadId, subject: threadId, messages: [first, ...rest] })
    } else {
      loaded.finished.push(threadId)
    }
  }
  return loaded
}

/**
 * A Microsoft mailbox whose unread mail is `state.unread` (change it to let mail arrive or be
 * read elsewhere) and whose Sent Items is `state.sent`. Marking as read takes mail out of
 * `state.unread`, marking as unread puts it back.
 */
function rankedMailbox(
  accountId: string,
  { unread = [], sent = [] }: { unread?: Mail.Envelope[]; sent?: Mail.SentEnvelope[] } = {},
) {
  const state = { unread: [...unread], sent: [...sent], read: [] as Mail.Envelope[] }
  function listing({ limit, before }: Mail.Listing): Mail.Envelope[] {
    const until = before === undefined ? Number.POSITIVE_INFINITY : Date.parse(before)
    return state.unread
      .filter(entry => Date.parse(entry.receivedAt) <= until)
      .toSorted(newestFirst)
      .slice(0, limit)
  }
  const mailbox = mailFakes.mailbox(accountId, mailboxOwner)
  const { provider } = mailbox
  provider.listUnread.mockImplementation(async (_, request) => listing(request))
  provider.listUnreadIds.mockImplementation(async (_, { limit }) =>
    listing({ limit }).map(({ id, threadId, receivedAt }) => ({ id, threadId, receivedAt })),
  )
  provider.loadThreads.mockImplementation(async (_, threadIds) =>
    threadsOf(state.unread, threadIds),
  )
  provider.listSent.mockImplementation(async (_, { limit }) => state.sent.slice(0, limit))
  provider.setRead.mockImplementation(async (_, ids, read) => {
    const [from, to] = read ? [state.unread, state.read] : [state.read, state.unread]
    to.push(...from.filter(entry => ids.includes(entry.id)))
    const kept = from.filter(entry => !ids.includes(entry.id))
    from.splice(0, from.length, ...kept)
  })
  return { ...mailbox, state }
}

/** A judge that answers with `answer` (by default: asks the reader something), and records what it was asked. */
function fakeJudge(
  answer: (input: Ranking.JudgeInput) => Ranking.Answers | Promise<Ranking.Answers> = () => ASKS,
  id = 'fake/1',
) {
  return {
    id,
    judge: vi.fn<Ranking.Judge['judge']>(async input => ({ answers: await answer(input) })),
  }
}

/** A database with one mailbox of this unread and sent mail, synced to its end. */
async function synced({
  unread = [],
  sent = [],
  judge = fakeJudge(),
  now = NOW,
}: {
  unread?: Mail.Envelope[]
  sent?: Mail.SentEnvelope[]
  judge?: Ranking.Judge
  now?: Date
} = {}) {
  const { db, accountIds } = await rankingDatabase()
  const [accountId = ''] = accountIds
  const mailbox = rankedMailbox(accountId, { unread, sent })
  await sync.step(mailbox, { db, key, judge, now: () => now }, { start: false })
  return { db, accountId, mailbox }
}

const rankingFakes = {
  now: NOW,
  none: NONE,
  key,
  asks: ASKS,
  lena,
  hoursAgo,
  database: rankingDatabase,
  envelope,
  mailbox: rankedMailbox,
  judge: fakeJudge,
  synced,
}

export default rankingFakes
