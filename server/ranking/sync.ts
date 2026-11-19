import type { mailboxProfiles, unreadMessages } from '../db/schema'
import calendarTime from '#shared/utils/calendar-time'
import type createDatabase from '../db/client'
import facts from './facts'
import indexStore from './index-store'
import judgeInput from './judges/input'
import mailboxLookup from '../mail/mailbox-lookup'
import scoring from './score'
import standing from './standing'

/*
 * One sync step for a mailbox (`step`): brings the index of unread mail in step with the
 * mailbox, in small steps that can be resumed, one at a time per mailbox. In this order:
 * the lease; standing (Sent Items, when there is no profile, it is a day old, or the facts
 * changed) and the scores' version; the starting batch when asked for (the newest 50
 * messages, then the step ends); the list step (all unread ids, at most once a minute);
 * judge pages while time is left; done. Every write is idempotent, and the index is its
 * own progress: stopping anywhere loses at most the page in flight.
 */

type Row = typeof unreadMessages.$inferSelect
type Profile = typeof mailboxProfiles.$inferSelect
type JudgedRow = Parameters<typeof indexStore.writeJudged>[2]['rows'][number]
type Work = ReturnType<typeof indexStore.workFor>

interface Limits {
  /** A step works this long, and aborts the judge's calls still running then. */
  budgetMs: number
  /** A judge page is only started while this much of the budget is left. */
  pageReserveMs: number
  /** How long the lease holds: the budget plus room for a slow Graph call. */
  leaseMs: number
  /** The most unread messages the index knows; beyond them the oldest stay out. */
  maxListed: number
  /** Messages with their texts per judge page, and judge calls at a time. */
  judgePage: number
  judgeConcurrency: number
  /** A message the judge did not answer for is asked again this much later at the earliest. */
  retryAfterMs: number
  /** The unread mail is listed in full at most this often. */
  listEveryMs: number
  /** Sent Items is scanned again once the profile is this old. */
  rescanAfterMs: number
  /**
   * A message resolved in Linelo that a listing still finds unread this much later was
   * marked unread again in the mailbox (or never marked read): it comes back. Before
   * that, Graph may simply not show the new state yet.
   */
  reopenAfterMs: number
}

const DEFAULT_LIMITS: Limits = {
  budgetMs: 8000,
  pageReserveMs: 3000,
  leaseMs: calendarTime.MILLISECONDS_PER_MINUTE,
  maxListed: 20_000,
  judgePage: 50,
  judgeConcurrency: 10,
  retryAfterMs: 600_000,
  listEveryMs: calendarTime.MILLISECONDS_PER_MINUTE,
  rescanAfterMs: calendarTime.MILLISECONDS_PER_DAY,
  reopenAfterMs: 120_000,
}

interface Dependencies {
  db: ReturnType<typeof createDatabase>['db']
  key: Ranking.AddressKey
  /** The judge for this mailbox; `undefined` ranks by the rules alone. */
  judge: Ranking.Judge | undefined
  now: () => Date
  limits?: Partial<Limits>
  /** Ends the step early, as its budget does. */
  signal?: AbortSignal
  /** One line per step that asked the judge: how many messages it answered for, and the tokens it read. */
  log?: (message: string, details: unknown) => void
}

/** One step: what it works with, and when it has to stop. */
interface Run extends Dependencies {
  mailbox: Mail.Mailbox
  accountId: string
  limits: Limits
  startedAt: number
  /** Aborted when the budget ran out. */
  signal: AbortSignal
  correspondents: Ranking.Correspondents
  /** What the judge answered for in this step, and the input tokens it reported. */
  judged: { messages: number; inputTokens: number }
}

function retryCutoff(run: Run): Date {
  return new Date(run.now().getTime() - run.limits.retryAfterMs)
}

function judgeTerms(run: Run) {
  return { judgeId: run.judge?.id, triedBefore: retryCutoff(run) }
}

/** Whether another judge page fits into the budget. */
function timeLeft(run: Run): boolean {
  const elapsed = run.now().getTime() - run.startedAt
  return !run.signal.aborted && elapsed <= run.limits.budgetMs - run.limits.pageReserveMs
}

/** Maps the items with at most `size` calls running at a time, keeping their order. */
async function mapPool<Item, Result>(
  items: readonly Item[],
  size: number,
  map: (item: Item) => Promise<Result>,
): Promise<Result[]> {
  const results: Result[] = []
  const queue = items.entries()
  async function worker(): Promise<void> {
    for (const [index, item] of queue) {
      // eslint-disable-next-line eslint/no-await-in-loop
      results[index] = await map(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()))
  return results
}

/** Recomputes the score of every row with facts, with these correspondents and the current weights. */
async function recompute(run: Run, correspondents: Ranking.Correspondents): Promise<void> {
  const rows = await indexStore.scoredRows(run.db, run.accountId)
  const now = run.now()
  const scores = rows.map(row => ({
    messageId: row.messageId,
    score: scoring.evaluate({
      facts: row.facts,
      correspondents,
      answers: row.answers,
      receivedAt: row.receivedAt,
      now,
    }).score,
  }))
  await indexStore.updateScores(run.db, run.accountId, scores)
}

/**
 * The owner's correspondents. Sent Items is scanned when there is no profile yet, when the
 * facts changed (another key or a new version: then the rows' facts go too, and are taken
 * anew), or (not in a starting batch) when the scan is a day old. A scan, or weights of
 * another version, recompute the scores; the profile is written once that succeeded.
 */
async function updateStanding(
  run: Run,
  profile: Profile,
  start: boolean,
): Promise<Ranking.Correspondents> {
  const factsCheck = facts.check(run.key)
  const factsChanged = profile.factsCheck !== factsCheck
  const scannedAt = profile.sentScannedAt?.getTime()
  const old = scannedAt !== undefined && run.now().getTime() - scannedAt >= run.limits.rescanAfterMs
  const rescan = scannedAt === undefined || factsChanged || (old && !start)
  const reweigh = profile.scoresVersion !== scoring.version && !start
  if (!rescan && !reweigh) {
    return profile.correspondents
  }
  const correspondents = rescan ? await standing.scan(run.mailbox, run.key) : profile.correspondents
  await (factsChanged
    ? indexStore.forgetFacts(run.db, run.accountId)
    : recompute(run, correspondents))
  await indexStore.updateProfile(run.db, run.accountId, {
    correspondents,
    factsCheck,
    scoresVersion: scoring.version,
    ...(rescan ? { sentScannedAt: run.now() } : {}),
  })
  return correspondents
}

/**
 * Adds what is new, drops what is no longer unread, and brings back what was resolved in
 * Linelo but is unread in the mailbox again; at most once a minute.
 */
async function listIfDue(run: Run, profile: Profile): Promise<void> {
  const listedAt = profile.listedAt?.getTime()
  if (listedAt !== undefined && run.now().getTime() - listedAt < run.limits.listEveryMs) {
    return
  }
  const { provider, connection } = run.mailbox
  const listed = await provider.listUnreadIds(connection, { limit: run.limits.maxListed })
  const known = await indexStore.knownRows(run.db, run.accountId)
  const knownIds = new Set(known.map(row => row.messageId))
  const unread = new Set(listed.map(entry => entry.id))
  const reopenBefore = run.now().getTime() - run.limits.reopenAfterMs
  await indexStore.addListed(
    run.db,
    run.accountId,
    listed.filter(entry => !knownIds.has(entry.id)),
  )
  await indexStore.deleteMessages(
    run.db,
    run.accountId,
    known.filter(row => !unread.has(row.messageId)).map(row => row.messageId),
  )
  const reopened = known.filter(
    row =>
      unread.has(row.messageId) &&
      row.resolvedAt !== null &&
      row.resolvedAt.getTime() < reopenBefore,
  )
  await indexStore.setResolved(run.db, run.accountId, {
    ids: reopened.map(row => row.messageId),
    // eslint-disable-next-line unicorn/no-null
    resolvedAt: null,
  })
  await indexStore.updateProfile(run.db, run.accountId, { listedAt: run.now() })
}

/** What a message keeps of its row: nothing when the index did not know it. */
function keptAnswers(row: Row | undefined): Pick<JudgedRow, 'answers' | 'judge' | 'triedAt'> {
  // eslint-disable-next-line unicorn/no-null
  return { answers: row?.answers ?? null, judge: row?.judge ?? null, triedAt: row?.triedAt ?? null }
}

/**
 * The judge's answers for the message. A call that was not started because the budget had
 * already run out leaves the row as it was, so the next step asks; a call that failed or
 * was cut off while running sets `triedAt`, so a judge that hangs cannot stall the sync.
 */
async function answersFor(
  run: Run,
  envelope: Mail.Envelope,
  row: Row | undefined,
): Promise<Pick<JudgedRow, 'answers' | 'judge' | 'triedAt'>> {
  const kept = keptAnswers(row)
  const { judge } = run
  if (!judge || run.signal.aborted) {
    return kept
  }
  try {
    const input = judgeInput(envelope, run.mailbox.connection.account.address)
    const { answers, inputTokens } = await judge.judge(input, { signal: run.signal })
    run.judged.messages += 1
    run.judged.inputTokens += inputTokens ?? 0
    // eslint-disable-next-line unicorn/no-null
    return { answers, judge: judge.id, triedAt: null }
  } catch {
    // No usable answer: the rules' score stands, and the judge is asked again later
    return { ...kept, triedAt: run.now() }
  }
}

/** Facts, the judge's answers when they are due, and the score of one message, written together. */
async function judgeOne(
  run: Run,
  { envelope, row, work }: { envelope: Mail.Envelope; row: Row | undefined; work: Work },
): Promise<JudgedRow> {
  const owner = run.mailbox.connection.account.address
  const messageFacts = facts.of(envelope, { owner, key: run.key })
  const answered = work === 'judge' ? await answersFor(run, envelope, row) : keptAnswers(row)
  const receivedAt = new Date(envelope.receivedAt)
  const { score } = scoring.evaluate({
    facts: messageFacts,
    correspondents: run.correspondents,
    answers: answered.answers,
    receivedAt,
    now: run.now(),
  })
  return {
    messageId: envelope.id,
    threadId: envelope.threadId,
    receivedAt,
    facts: messageFacts,
    ...answered,
    score,
  }
}

/**
 * Rows the page shows were read in the meantime: those between the page's oldest message and
 * `before` that it does not hold. Never older than its oldest message: what lies beyond a
 * page is the list step's to decide. An empty page holds nothing up to `before`.
 */
function missingFrom(
  run: Run,
  envelopes: readonly Mail.Envelope[],
  before: Date | undefined,
): Promise<string[]> {
  const oldest = envelopes.at(-1)
  return indexStore.rowsMissingFrom(run.db, run.accountId, {
    ids: envelopes.map(envelope => envelope.id),
    before,
    after: oldest ? new Date(oldest.receivedAt) : undefined,
  })
}

/**
 * One judge page: the 50 newest unread messages received at or before `before`, each with
 * its text; each gets what it needs (`indexStore.workFor`), 10 judge calls at a time. Only
 * the starting batch (no `before`) adds messages the index does not know: otherwise the
 * listing decides what is in the index, so the oldest beyond its cap stay out. Resolves to
 * the ids it judged or deleted.
 */
async function judgePage(run: Run, before: Date | undefined): Promise<Set<string>> {
  const { provider, connection } = run.mailbox
  const envelopes = await provider.listUnread(connection, {
    limit: run.limits.judgePage,
    before: before?.toISOString(),
  })
  const rows = await indexStore.rowsOf(
    run.db,
    run.accountId,
    envelopes.map(envelope => envelope.id),
  )
  const terms = judgeTerms(run)
  const due = envelopes.flatMap(envelope => {
    const row = rows.get(envelope.id)
    const work = indexStore.workFor(row, terms)
    return work === 'skip' || (!row && before) ? [] : [{ envelope, row, work }]
  })
  const judged = await mapPool(due, run.limits.judgeConcurrency, entry => judgeOne(run, entry))
  await indexStore.writeJudged(run.db, run.accountId, { rows: judged, now: run.now() })
  const missing = await missingFrom(run, envelopes, before)
  await indexStore.deleteMessages(run.db, run.accountId, missing)
  return new Set([...judged.map(row => row.messageId), ...missing])
}

/** Judge pages from the newest row that needs one, while time is left; `done` when none is left. */
async function judgeWhileTimeLeft(run: Run): Promise<Ranking.StepResult> {
  while (timeLeft(run)) {
    // eslint-disable-next-line eslint/no-await-in-loop
    const next = await indexStore.nextToJudge(run.db, run.accountId, judgeTerms(run))
    if (!next) {
      // eslint-disable-next-line eslint/no-await-in-loop
      await indexStore.updateProfile(run.db, run.accountId, { syncedAt: run.now() })
      return 'done'
    }
    // eslint-disable-next-line eslint/no-await-in-loop
    const touched = await judgePage(run, next.receivedAt)
    if (!touched.has(next.messageId)) {
      // More messages of the same second than a page holds: the next listing brings it back
      console.warn('A judge page could not reach a message; it leaves the index for now')
      // eslint-disable-next-line eslint/no-await-in-loop
      await indexStore.deleteMessages(run.db, run.accountId, [next.messageId])
    }
  }
  return 'more'
}

/** Runs the step once the lease is held. */
async function runStep(run: Run, start: boolean): Promise<Ranking.StepResult> {
  const profile = await indexStore.profile(run.db, run.accountId)
  if (!profile) {
    throw new Error('The mailbox profile is missing after creating it')
  }
  run.correspondents = await updateStanding(run, profile, start)
  if (start) {
    await judgePage(run, undefined)
    return 'more'
  }
  await listIfDue(run, profile)
  return judgeWhileTimeLeft(run)
}

function logJudged(run: Run): void {
  const { messages, inputTokens } = run.judged
  if (run.judge && messages > 0) {
    run.log?.('Judged unread mail', { judge: run.judge.id, messages, inputTokens })
  }
}

/**
 * One sync step for the mailbox: `busy` when another step holds its lease, `done` when
 * nothing is left to judge, `more` otherwise. With `start`, the starting batch: one judge
 * page of the newest 50 unread messages, then the step ends, so the page can show a message.
 */
async function step(
  mailbox: Mail.Mailbox,
  dependencies: Dependencies,
  { start }: { start: boolean },
): Promise<Ranking.StepResult> {
  const limits = { ...DEFAULT_LIMITS, ...dependencies.limits }
  const { db, key, now } = dependencies
  const accountId = mailbox.connection.account.id
  const startedAt = now()
  const until = new Date(startedAt.getTime() + limits.leaseMs)
  await indexStore.ensureProfile(db, accountId, facts.check(key))
  if (!(await indexStore.claimLease(db, accountId, { now: startedAt, until }))) {
    return 'busy'
  }
  const budget = AbortSignal.timeout(limits.budgetMs)
  const run: Run = {
    ...dependencies,
    mailbox,
    accountId,
    limits,
    startedAt: startedAt.getTime(),
    signal: dependencies.signal ? AbortSignal.any([budget, dependencies.signal]) : budget,
    correspondents: {},
    judged: { messages: 0, inputTokens: 0 },
  }
  try {
    return await runStep(run, start)
  } finally {
    logJudged(run)
    await indexStore.releaseLease(db, accountId, until)
  }
}

/**
 * One step for each of the user's mailboxes, at the same time: `busy` when another step
 * held one of them, `done` when nothing is left to judge in any, `more` otherwise. All
 * steps settle before a failure is passed on, so none is left running.
 */
async function stepAll(
  mailboxes: readonly Mail.Mailbox[],
  {
    judgeFor,
    ...dependencies
  }: Omit<Dependencies, 'judge'> & {
    judgeFor: (mailbox: Mail.Mailbox) => Ranking.Judge | undefined
  },
  { start }: { start: boolean },
): Promise<Inbox.SyncResponse> {
  const settled = await Promise.allSettled(
    mailboxLookup
      .requireMailboxes(mailboxes)
      .map(mailbox => step(mailbox, { ...dependencies, judge: judgeFor(mailbox) }, { start })),
  )
  const results = settled.map(result => {
    if (result.status === 'rejected') {
      throw result.reason
    }
    return result.value
  })
  if (results.includes('busy')) {
    return { status: 'busy' }
  }
  return { status: results.every(result => result === 'done') ? 'done' : 'more' }
}

const sync = { step, stepAll }

export default sync
