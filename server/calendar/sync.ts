import { and, asc, eq, gt, inArray, isNull, lt, or } from 'drizzle-orm'
import { calendarDecisions, users } from '../db/schema'
import copies from './copies'
import isGone from '#shared/utils/is-gone'
import readers from './readers'
import sources from './sources'
import suggestions from './suggestions'

/*
 * Keeps the copies in step with their sources, whenever the calendar page opens:
 * - every run, the single events in the horizon, compared through one listing of each source;
 * - at most every 5 minutes per user, everything else: series, single events further ahead,
 *   copies deleted in Outlook, and copies that were never finished.
 * Deletions happen only for an explicit cancellation or a confirmed 404 while the source
 * calendar answers, never because a whole calendar stopped answering. The user's own edits
 * of a copy win over content changes; times, pattern and cancellation still follow.
 * A source or a copy that fails is reported or left for the next run; the others go on.
 */

type DecisionRow = typeof calendarDecisions.$inferSelect
type SourceRow = Awaited<ReturnType<typeof sources.active>>[number]

interface Limits {
  /** Copies (and cancelled occurrences) deleted per run at most. */
  maxDeletions: number
  /** A run that takes longer stops, and the next one continues. */
  budgetMs: number
  /** Rows looked at by one run, least recently synced first. */
  maxRows: number
  /** The full reconcile runs at most this often per user. */
  throttleMs: number
  /** A row without a copy that is younger than this may still be in the middle of its accept. */
  repairAfterMs: number
  /** After a run in which a copy or a source failed, the full reconcile runs again this much sooner. */
  retryAfterMs: number
}

const DEFAULT_LIMITS: Limits = {
  maxDeletions: 20,
  budgetMs: 10_000,
  maxRows: 200,
  throttleMs: 300_000,
  repairAfterMs: 60_000,
  retryAfterMs: 60_000,
}

/** A source that answered, with its events in the horizon and its accepted rows. */
interface Reachable {
  source: SourceRow
  reader: Calendar.SourceReader
  events: readonly Calendar.Event[]
  rows: DecisionRow[]
}

/** One run: what it did so far, and when it has to stop. */
interface Run {
  db: Calendar.Context['db']
  main: Calendar.Account
  now: Date
  limits: Limits
  deadline: number
  clock: () => number
  deletions: number
  updated: number
  removed: Calendar.Removal[]
  unreachable: Set<string>
  /** Rows this run deleted, so later steps leave them alone. */
  removedRows: Set<string>
  /** Rows this run looked at in full, which move to the back of the queue. */
  checked: Set<string>
  /** The budget ran out: the rest of the full reconcile waits for the next visit. */
  outOfTime: boolean
  /** A copy or a source failed: the full reconcile runs again a little sooner. */
  failed: boolean
}

/** Whether the run used up its time; what is left waits for the next run. */
function overBudget(run: Run): boolean {
  const over = run.clock() > run.deadline
  if (over) {
    run.outOfTime = true
  }
  return over
}

/** Runs one step for a row; a failure is logged and leaves the row for the next run. */
async function guarded(run: Run, what: string, step: () => Promise<void>): Promise<void> {
  try {
    await step()
  } catch (error) {
    console.warn(`Syncing a calendar copy failed: ${what}`, error)
    run.failed = true
  }
}

/** Every write is conditional on the row as it was read, so an Undo or a removal in the meantime wins. */
function sameRow(row: DecisionRow) {
  return and(
    eq(calendarDecisions.id, row.id),
    eq(calendarDecisions.decision, 'accepted'),
    row.copyEventId === null
      ? isNull(calendarDecisions.copyEventId)
      : eq(calendarDecisions.copyEventId, row.copyEventId),
  )
}

/** A copy that was deleted in Outlook: the user does not want the event, so it is not offered again. */
async function markDismissed(run: Run, row: DecisionRow): Promise<void> {
  await run.db
    .update(calendarDecisions)
    // JSON and the database have no `undefined`
    // eslint-disable-next-line unicorn/no-null
    .set({ decision: 'dismissed', copyEventId: null, copyVersion: null })
    .where(sameRow(row))
}

/** Deletes the copy of a cancelled (or gone) source event, and its row, and reports it. */
async function removeCopy(
  run: Run,
  { source, row }: { source: SourceRow; row: DecisionRow },
  fallbackTitle: string,
): Promise<void> {
  if (!row.copyEventId || run.deletions >= run.limits.maxDeletions) {
    return
  }
  const { main } = run
  // The copy's own title for the notice, read before it goes
  const [copy] = await main.provider.getMainEvents(main.connection, [row.copyEventId])
  const title = copy && !isGone(copy) ? copy.title : fallbackTitle
  await main.provider.deleteEvent(main.connection, row.copyEventId)
  run.deletions += 1
  const deleted = await run.db
    .delete(calendarDecisions)
    .where(sameRow(row))
    .returning({ id: calendarDecisions.id })
  if (deleted.length > 0) {
    run.removedRows.add(row.id)
    run.removed.push({ title, source: source.name })
  }
}

/**
 * Writes the source's content to the copy. A copy the user edited in Outlook (its version
 * differs from the one Linelo wrote) only takes times, pattern and the all-day flag;
 * its subject, body and location stay. Its stored version stays too, so it stays "edited".
 */
async function updateCopy(
  run: Run,
  row: DecisionRow,
  { content, version }: { content: Calendar.EventContent; version: string | null },
): Promise<void> {
  if (!row.copyEventId) {
    return
  }
  const { main } = run
  const [current] = await main.provider.getMainEvents(main.connection, [row.copyEventId])
  if (!current || isGone(current)) {
    await markDismissed(run, row)
    return
  }
  const edited = current.version !== row.copyVersion
  const { start, end, isAllDay, recurrence } = content
  const patch = edited ? { start, end, isAllDay, ...(recurrence ? { recurrence } : {}) } : content
  const written = await main.provider.updateEvent(main.connection, row.copyEventId, patch)
  await run.db
    .update(calendarDecisions)
    .set({
      sourceVersion: version,
      ...(edited ? {} : { copyVersion: written.version }),
      updatedAt: run.now,
    })
    .where(sameRow(row))
  run.updated += 1
}

/** Reads the single events in full and brings their copies in step: gone or cancelled removes, changed updates. */
async function updateSingles(
  run: Run,
  reachable: Reachable,
  rows: readonly DecisionRow[],
): Promise<void> {
  if (rows.length === 0 || overBudget(run)) {
    return
  }
  const found = await reachable.reader.getEvents(rows.map(row => row.sourceEventId))
  const byId = new Map(found.map(entry => [entry.id, entry]))
  for (const row of rows) {
    const entry = byId.get(row.sourceEventId)
    if (!entry || overBudget(run)) {
      continue
    }
    // eslint-disable-next-line eslint/no-await-in-loop
    await guarded(run, row.id, async () => {
      if (isGone(entry) || entry.cancelled) {
        // The calendar answered: the event is gone or cancelled
        await removeCopy(
          run,
          { source: reachable.source, row },
          isGone(entry) ? 'An event' : entry.title,
        )
      } else if (entry.version !== row.sourceVersion) {
        await updateCopy(run, row, entry)
      }
      run.checked.add(row.id)
    })
  }
}

/** Single events in the horizon: the listing carries their versions and cancellations. */
async function reconcileWindow(run: Run, reachable: Reachable): Promise<Set<string>> {
  const singles = new Map(
    reachable.events.filter(event => !event.seriesMasterId).map(event => [event.id, event]),
  )
  const handled = new Set<string>()
  const changed: DecisionRow[] = []
  for (const row of reachable.rows) {
    const event = singles.get(row.sourceEventId)
    if (!event || row.sourceEnd === null || !row.copyEventId || overBudget(run)) {
      continue
    }
    handled.add(row.id)
    run.checked.add(row.id)
    if (event.cancelled) {
      // eslint-disable-next-line eslint/no-await-in-loop
      await guarded(run, row.id, () =>
        removeCopy(run, { source: reachable.source, row }, event.title),
      )
    } else if (event.version !== row.sourceVersion) {
      changed.push(row)
    }
  }
  await updateSingles(run, reachable, changed)
  return handled
}

/** Series: pattern, times and content by version, cancellation, and the cancelled dates in the horizon. */
async function reconcileSeries(
  run: Run,
  reachable: Reachable,
  rows: readonly DecisionRow[],
): Promise<void> {
  if (rows.length === 0 || overBudget(run)) {
    return
  }
  const series = await reachable.reader.getSeries(rows.map(row => row.sourceEventId))
  const byId = new Map(series.map(entry => [entry.id, entry]))
  const changed = rows.filter(row => {
    const entry = byId.get(row.sourceEventId)
    return entry && !entry.cancelled && entry.version !== row.sourceVersion
  })
  const withContent =
    changed.length > 0
      ? await reachable.reader.getSeriesContent(changed.map(row => row.sourceEventId))
      : []
  const contents = new Map(withContent.map(entry => [entry.id, entry]))
  for (const row of rows) {
    const { copyEventId } = row
    if (overBudget(run) || !copyEventId) {
      continue
    }
    // eslint-disable-next-line eslint/no-await-in-loop
    await guarded(run, row.id, async () => {
      const entry = byId.get(row.sourceEventId)
      if (!entry || entry.cancelled) {
        // Left out by the reader: gone, while its calendar answers
        await removeCopy(run, { source: reachable.source, row }, 'A series')
        return
      }
      const content = contents.get(row.sourceEventId)
      if (content) {
        await updateCopy(run, row, content)
      }
      run.deletions += await copies.removeCancelledDates(
        { main: run.main, copyId: copyEventId, series: entry },
        {
          from: run.now,
          to: suggestions.horizonEnd(run.now),
          limit: run.limits.maxDeletions - run.deletions,
        },
      )
      run.checked.add(row.id)
    })
  }
}

/** Copies deleted in Outlook turn their rows into `dismissed`; resolves to the rows whose copies exist. */
async function dropDeletedCopies(run: Run, rows: readonly DecisionRow[]): Promise<DecisionRow[]> {
  const withCopy = rows.flatMap(row =>
    row.copyEventId === null ? [] : [{ row, copyId: row.copyEventId }],
  )
  if (withCopy.length === 0) {
    return []
  }
  const found = await run.main.provider.getMainEvents(
    run.main.connection,
    withCopy.map(entry => entry.copyId),
  )
  const gone = new Set(found.filter(entry => isGone(entry)).map(entry => entry.id))
  const kept: DecisionRow[] = []
  for (const { row, copyId } of withCopy) {
    if (gone.has(copyId)) {
      // eslint-disable-next-line eslint/no-await-in-loop
      await guarded(run, row.id, () => markDismissed(run, row))
    } else {
      kept.push(row)
    }
  }
  return kept
}

/**
 * Rows whose accept stopped after the row was written: the copy is made again with the same
 * `transactionId`. When the source event is gone, a copy Graph made for that accept cannot
 * be found again; only the row goes.
 */
async function repair(run: Run, reachable: Reachable): Promise<void> {
  const cutoff = run.now.getTime() - run.limits.repairAfterMs
  const stale = reachable.rows.filter(
    row => row.copyEventId === null && row.createdAt.getTime() < cutoff,
  )
  for (const row of stale) {
    if (overBudget(run)) {
      return
    }
    // eslint-disable-next-line eslint/no-await-in-loop
    await guarded(run, row.id, async () => {
      const target = await copies.readTarget(reachable.reader, row.sourceEventId)
      if (!target) {
        await run.db.delete(calendarDecisions).where(sameRow(row))
        return
      }
      const copy = await copies.createCopy(run.main, target, row.id)
      if (await copies.recordCopy(run.db, { rowId: row.id, target }, copy)) {
        run.updated += 1
      } else {
        // Undone or dismissed in the meantime
        await run.main.provider.deleteEvent(run.main.connection, copy.id)
      }
      run.checked.add(row.id)
    })
  }
}

/** A source that answered its listing, then failed: its copies stay for the next run. */
function failSource(run: Run, reachable: Reachable, error: unknown): void {
  console.warn('Syncing a calendar source failed', reachable.source.name, error)
  run.unreachable.add(reachable.source.name)
  run.failed = true
}

/** Everything the window does not see, for one source. `handled` rows were compared by the window already. */
async function reconcileSource(
  run: Run,
  reachable: Reachable,
  handled: ReadonlySet<string>,
): Promise<void> {
  const rows = reachable.rows.filter(row => !run.removedRows.has(row.id))
  await repair(run, reachable)
  // Also for the rows the window compared: only this finds a copy deleted in Outlook
  const kept = await dropDeletedCopies(run, rows)
  const unseen = kept.filter(row => !handled.has(row.id))
  await reconcileSeries(
    run,
    reachable,
    unseen.filter(row => row.sourceEnd === null),
  )
  await updateSingles(
    run,
    reachable,
    unseen.filter(row => row.sourceEnd !== null && row.sourceEnd.getTime() > run.now.getTime()),
  )
}

/**
 * Claims the full reconcile for this user, at most once per throttle period, so parallel
 * tabs run it once. `previous` is when it ran before, to give the claim back.
 */
async function claimFullRun(
  run: Run,
  userId: string,
): Promise<{ claimed: boolean; previous: Date | null }> {
  const [user] = await run.db
    .select({ syncedAt: users.calendarSyncedAt })
    .from(users)
    .where(eq(users.id, userId))
  const since = new Date(run.now.getTime() - run.limits.throttleMs)
  const due = or(isNull(users.calendarSyncedAt), lt(users.calendarSyncedAt, since))
  const claimed = await run.db
    .update(users)
    .set({ calendarSyncedAt: run.now })
    .where(and(eq(users.id, userId), due))
    .returning({ id: users.id })
  // eslint-disable-next-line unicorn/no-null
  return { claimed: claimed.length > 0, previous: user?.syncedAt ?? null }
}

/**
 * After a full reconcile that did not finish: out of time, the claim goes back so the
 * next visit continues; a failed copy or source lets it run again after `retryAfterMs`
 * instead of the whole throttle, so one copy that keeps failing does not run it on every visit.
 */
async function settleClaim(run: Run, userId: string, previous: Date | null): Promise<void> {
  if (!run.outOfTime && !run.failed) {
    return
  }
  const retryAt = new Date(run.now.getTime() - run.limits.throttleMs + run.limits.retryAfterMs)
  await run.db
    .update(users)
    .set({ calendarSyncedAt: run.outOfTime ? previous : retryAt })
    .where(and(eq(users.id, userId), eq(users.calendarSyncedAt, run.now)))
}

/**
 * Accepted rows of the user's active sources that still matter, least recently synced
 * first: series, and single events that have not ended (past ones are not synced, and
 * would keep their place at the front for ever).
 */
function acceptedRows(
  run: Run,
  userId: string,
  sourceIds: readonly string[],
): Promise<DecisionRow[]> {
  if (sourceIds.length === 0) {
    return Promise.resolve([])
  }
  const ahead = or(isNull(calendarDecisions.sourceEnd), gt(calendarDecisions.sourceEnd, run.now))
  return run.db
    .select()
    .from(calendarDecisions)
    .where(
      and(
        eq(calendarDecisions.userId, userId),
        eq(calendarDecisions.decision, 'accepted'),
        inArray(calendarDecisions.sourceId, [...sourceIds]),
        ahead,
      ),
    )
    .orderBy(asc(calendarDecisions.updatedAt))
    .limit(run.limits.maxRows)
}

/** Reads the sources that have copies, for the horizon. Sources without copies are not read: the week names them. */
async function readReachable(
  run: Run,
  { accounts, userId }: { accounts: readonly Calendar.Account[]; userId: string },
): Promise<Reachable[]> {
  const active = await sources.active(run.db, userId)
  const rows = await acceptedRows(
    run,
    userId,
    active.map(source => source.id),
  )
  const withRows = active.filter(source => rows.some(row => row.sourceId === source.id))
  const { reachable, unreachable } = await readers.readSources(withRows, accounts, [
    suggestions.horizon(run.now),
  ])
  for (const source of unreachable) {
    run.unreachable.add(source.name)
  }
  const rowsOf = Map.groupBy(rows, row => row.sourceId)
  return reachable.map(({ source, reader, events }) => ({
    source,
    reader,
    events,
    rows: rowsOf.get(source.id) ?? [],
  }))
}

/**
 * Reconciles the user's copies with their sources. A source that does not answer, or
 * fails after it listed its events, is reported in `unreachable` and its copies stay as
 * they are; the others go on. A run out of time gives its claim on the full reconcile
 * back (`settleClaim`).
 */
async function sync(
  { db, accounts, main, now }: Calendar.Context,
  userId: string,
  { limits = DEFAULT_LIMITS, clock = Date.now }: { limits?: Limits; clock?: () => number } = {},
): Promise<Calendar.Outcome<Calendar.SyncResponse>> {
  const run: Run = {
    db,
    main,
    now,
    limits,
    clock,
    deadline: clock() + limits.budgetMs,
    deletions: 0,
    updated: 0,
    removed: [],
    unreachable: new Set(),
    removedRows: new Set(),
    checked: new Set(),
    outOfTime: false,
    failed: false,
  }
  const reachable = await readReachable(run, { accounts, userId })
  const handled = new Set<string>()
  /** Sources that listed their events, then failed: the full reconcile leaves them out too. */
  const failing = new Set<string>()
  for (const entry of reachable) {
    try {
      // eslint-disable-next-line eslint/no-await-in-loop
      const done = await reconcileWindow(run, entry)
      for (const id of done) {
        handled.add(id)
      }
    } catch (error) {
      failSource(run, entry, error)
      failing.add(entry.source.id)
    }
  }
  const claim = overBudget(run) ? undefined : await claimFullRun(run, userId)
  if (claim?.claimed) {
    for (const entry of reachable) {
      if (overBudget(run)) {
        break
      }
      if (failing.has(entry.source.id)) {
        continue
      }
      try {
        // eslint-disable-next-line eslint/no-await-in-loop
        await reconcileSource(run, entry, handled)
      } catch (error) {
        failSource(run, entry, error)
      }
    }
    if (run.checked.size > 0) {
      // Least recently synced first, next time; rows the budget skipped keep their place
      await db
        .update(calendarDecisions)
        .set({ updatedAt: now })
        .where(inArray(calendarDecisions.id, [...run.checked]))
    }
    await settleClaim(run, userId, claim.previous)
  }
  return {
    result: 'ok',
    body: { updated: run.updated, removed: run.removed, unreachable: [...run.unreachable] },
  }
}

const calendarSync = { sync, defaultLimits: DEFAULT_LIMITS }

export default calendarSync
