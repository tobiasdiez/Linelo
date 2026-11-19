import type { mailboxProfiles, unreadMessages } from '../db/schema'
import calendarTime from '#shared/utils/calendar-time'
import type createDatabase from '../db/client'
import explain from './explain'
import indexStore from './index-store'
import mailboxLookup from '../mail/mailbox-lookup'
import order from './order'
import queueItemKey from '#shared/utils/queue-item-key'
import scoring from './score'

/*
 * The queue from the index: the best conversations by score, whether they are worth showing
 * at the start of a session, their threads loaded from the mailboxes, and the items with
 * why each is shown. No request for the queue lists the mailbox.
 */

type ScoredRow = typeof unreadMessages.$inferSelect & { facts: Ranking.Facts; score: number }
type Profile = typeof mailboxProfiles.$inferSelect

interface Dependencies {
  db: ReturnType<typeof createDatabase>['db']
  now: () => Date
  /** Development: logs each item's score and factors, so an odd order can be traced. */
  log?: (message: string, details: unknown) => void
}

interface Request {
  limit: number
  /** The first request of a session: an index with nothing worth showing answers `preparing`. */
  start: boolean
}

/** A row and its thread, as loaded. */
interface Loaded {
  row: ScoredRow
  thread: Inbox.Thread
}

/** A sync that ended this recently counts as fresh: what the index holds is the inbox. */
const FRESH_SYNC_MS = calendarTime.MILLISECONDS_PER_MINUTE
/** How often the index is asked again when every conversation it named was read elsewhere. */
const MAX_ROUNDS = 3

/** The thread of an account as the app sees it: its id made unique across accounts. */
function inAccount(thread: Mail.Thread, accountId: string): Inbox.Thread {
  return { ...thread, id: `${accountId}:${thread.id}`, accountId }
}

/** Whether every mailbox has a profile whose sync ended within the last minute. */
function freshlySynced(
  accountIds: readonly string[],
  profiles: readonly Profile[],
  now: Date,
): boolean {
  const syncedAt = new Map(profiles.map(profile => [profile.accountId, profile.syncedAt]))
  return accountIds.every(accountId => {
    const time = syncedAt.get(accountId)
    return time !== undefined && time !== null && now.getTime() - time.getTime() < FRESH_SYNC_MS
  })
}

/**
 * Loads the threads of the rows from their mailboxes, in the rows' order. A thread with
 * nothing unread left is dropped and its rows deleted, so it is never shown; `dropped`
 * counts them.
 */
async function loadThreads(
  { db }: Dependencies,
  mailboxes: readonly Mail.Mailbox[],
  rows: readonly ScoredRow[],
): Promise<{ loaded: Loaded[]; dropped: number }> {
  const threads = new Map<string, Inbox.Thread>()
  let dropped = 0
  await Promise.all(
    mailboxes.map(async ({ provider, connection }) => {
      const accountId = connection.account.id
      const threadIds = rows.filter(row => row.accountId === accountId).map(row => row.threadId)
      if (threadIds.length === 0) {
        return
      }
      const result = await provider.loadThreads(connection, threadIds)
      await indexStore.deleteThreads(db, accountId, result.finished)
      dropped += result.finished.length
      for (const thread of result.threads) {
        threads.set(`${accountId}:${thread.id}`, inAccount(thread, accountId))
      }
    }),
  )
  const loaded = rows.flatMap(row => {
    const thread = threads.get(`${row.accountId}:${row.threadId}`)
    return thread ? [{ row, thread }] : []
  })
  return { loaded, dropped }
}

function toItem(thread: Inbox.Thread, evaluation: Ranking.Evaluation): Inbox.QueueItem {
  return {
    key: queueItemKey(thread),
    thread,
    whyShown: explain.whyShown(evaluation),
    suggestions: explain.suggestions(evaluation),
    tier: evaluation.tier,
    assisted: evaluation.assisted,
  }
}

/** The items of the loaded rows, with the standing as it is now; long reads interleaved within a tier. */
function itemsOf(
  { now, log }: Dependencies,
  loaded: readonly Loaded[],
  profiles: readonly Profile[],
): Inbox.QueueItem[] {
  const correspondents = new Map(
    profiles.map(profile => [profile.accountId, profile.correspondents]),
  )
  const evaluated = loaded.map(({ row, thread }) => {
    const evaluation = scoring.evaluate({
      facts: row.facts,
      correspondents: correspondents.get(row.accountId) ?? {},
      answers: row.answers,
      receivedAt: row.receivedAt,
      now: now(),
    })
    log?.('Ranked', { thread: thread.id, score: row.score, factors: evaluation.factors })
    return { row, thread, evaluation }
  })
  // Long reads do not pile up: a lighter message of the same tier moves between them
  return order
    .interleave(evaluated, ({ row, evaluation }) => ({
      tier: evaluation.tier,
      heavy: row.facts.heavy === true,
    }))
    .map(({ thread, evaluation }) => toItem(thread, evaluation))
}

/**
 * The best conversations, loaded; `undefined` when nothing is worth showing at the start of
 * a session. When every conversation named was read elsewhere, the index is asked again.
 */
async function loadBest(
  dependencies: Dependencies,
  options: Request & { mailboxes: readonly Mail.Mailbox[]; accountIds: string[]; fresh: boolean },
): Promise<Loaded[] | undefined> {
  const { mailboxes, accountIds, limit, start, fresh } = options
  let loaded: Loaded[] = []
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    // eslint-disable-next-line eslint/no-await-in-loop
    const rows = await indexStore.bestConversations(dependencies.db, accountIds, limit)
    if (start && !fresh && rows.every(row => scoring.tierOf(row.score) === 'low')) {
      return undefined
    }
    // eslint-disable-next-line eslint/no-await-in-loop
    const result = await loadThreads(dependencies, mailboxes, rows)
    ;({ loaded } = result)
    if (loaded.length > 0 || result.dropped === 0) {
      break
    }
  }
  return loaded
}

/**
 * The best `limit` conversations of the user's mailboxes, as queue items in the order to
 * decide them: by stored score, newer first on ties. `preparing` when there is nothing worth
 * showing and a sync could change that: at the start of a session when nothing is above the
 * lowest tier, and whenever nothing is left; not when every mailbox synced within the last
 * minute. When every conversation named was read elsewhere, the index is asked again.
 */
async function load(
  mailboxes: readonly Mail.Mailbox[],
  { limit, start }: Request,
  dependencies: Dependencies,
): Promise<Inbox.InboxResponse> {
  const { db } = dependencies
  const accountIds = mailboxLookup
    .requireMailboxes(mailboxes)
    .map(({ connection }) => connection.account.id)
  const profiles = await indexStore.profiles(db, accountIds)
  const fresh = freshlySynced(accountIds, profiles, dependencies.now())
  const loaded = await loadBest(dependencies, { mailboxes, accountIds, limit, start, fresh })
  if (!loaded) {
    return { items: [], preparing: true }
  }
  return {
    items: itemsOf(dependencies, loaded, profiles),
    preparing: loaded.length === 0 && !fresh,
  }
}

const queue = { load }

export default queue
