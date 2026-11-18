import { and, eq, isNull } from 'drizzle-orm'
import { calendarDecisions, calendarSources } from '../db/schema'
import MailError from '../mail/mail-error'
import copies from './copies'
import isRecord from '#shared/utils/is-record'
import isUuid from '#shared/utils/is-uuid'
import readers from './readers'
import suggestions from './suggestions'

type SourceRow = typeof calendarSources.$inferSelect
type DecisionRow = typeof calendarDecisions.$inferSelect

interface Decide {
  userId: string
  source: SourceRow
  eventId: string
}

/** Graph's ids (and the demo's) are base64url-like: letters, digits, `-`, `_`, `=`, `+`. They end up in Graph paths. */
const EVENT_ID = /^[\w=+-]{1,1024}$/

const noSuchEvent = { refusal: 'not-found', message: 'No such event' } as const
const noSuchDecision = { refusal: 'not-found', message: 'No such decision' } as const
const decidedAlready = { refusal: 'conflict', message: 'Decided already' } as const

/** Reads the body of `POST /api/calendar/decisions`, or says what is wrong with it. */
function parseRequest(value: unknown): Calendar.DecisionRequest | string {
  if (!isRecord(value)) {
    return 'The body must be a JSON object'
  }
  const { sourceId, eventId, decision } = value
  if (!isUuid(sourceId)) {
    return 'sourceId must be the id of one of your calendar sources'
  }
  if (typeof eventId !== 'string' || !EVENT_ID.test(eventId)) {
    return 'eventId must be an event id'
  }
  if (decision !== 'accept' && decision !== 'dismiss') {
    return "decision must be 'accept' or 'dismiss'"
  }
  return { sourceId, eventId, decision }
}

/** The user's active source with this id. */
async function activeSource(
  db: Calendar.Context['db'],
  userId: string,
  sourceId: string,
): Promise<SourceRow | undefined> {
  const [row] = await db
    .select()
    .from(calendarSources)
    .where(
      and(
        eq(calendarSources.id, sourceId),
        eq(calendarSources.userId, userId),
        isNull(calendarSources.removedAt),
      ),
    )
  return row
}

/**
 * Whether the week would offer the target: not hidden, not over, and not in the main
 * calendar already. A series is judged by its first occurrence within the horizon.
 */
async function offerability(
  { main, now }: Calendar.Context,
  { reader, target }: { reader: Calendar.SourceReader; target: Calendar.CopyTarget },
): Promise<ReturnType<typeof suggestions.verdictOf>> {
  if (target.kind === 'single') {
    const { event } = target
    const range = event.allDay
      ? { from: `${event.start}T00:00:00Z`, to: `${event.end}T00:00:00Z` }
      : { from: event.start, to: event.end }
    const mainEvents = await main.provider.listMainEvents(main.connection, range)
    return suggestions.verdictOf(event, { now, main: mainEvents })
  }
  if (target.series.cancelled) {
    return 'hidden'
  }
  const horizon = suggestions.horizon(now)
  // In one tick, so the account sends one batch
  const [occurrences, mainEvents] = await Promise.all([
    reader.listEvents(horizon),
    main.provider.listMainEvents(main.connection, horizon),
  ])
  const verdicts = occurrences
    .filter(event => event.seriesMasterId === target.series.id)
    .map(event => suggestions.verdictOf(event, { now, main: mainEvents }))
  if (verdicts.length === 0) {
    // Nothing of the series within the horizon: it is judged when it comes closer
    return 'offered'
  }
  return (
    ['offered' as const, 'present' as const].find(wanted => verdicts.includes(wanted)) ?? 'hidden'
  )
}

/** The decision of the source event, if there is one. */
async function existingRow(
  db: Calendar.Context['db'],
  { source, eventId }: Pick<Decide, 'source' | 'eventId'>,
): Promise<DecisionRow | undefined> {
  const [row] = await db
    .select()
    .from(calendarDecisions)
    .where(
      and(eq(calendarDecisions.sourceId, source.id), eq(calendarDecisions.sourceEventId, eventId)),
    )
  return row
}

/** Whether a failed copy certainly reached nothing: Graph refused before creating anything. */
function refusedBeforeCreating(error: unknown): boolean {
  return error instanceof MailError && (error.kind === 'consent' || error.kind === 'reconnect')
}

/**
 * The row an accept writes its copy on: a new one, or one an earlier accept left without a
 * copy (it failed, or is still running), whose `transactionId` the retry uses again so Graph
 * makes one copy. `undefined` when the event is decided otherwise.
 */
async function acceptRow(
  db: Calendar.Context['db'],
  { userId, source, eventId }: Decide,
): Promise<{ id: string; created: boolean } | undefined> {
  const [row] = await db
    .insert(calendarDecisions)
    .values({ userId, sourceId: source.id, sourceEventId: eventId, decision: 'accepted' })
    .onConflictDoNothing()
    .returning({ id: calendarDecisions.id })
  if (row) {
    return { id: row.id, created: true }
  }
  const existing = await existingRow(db, { source, eventId })
  return existing?.decision === 'accepted' && existing.copyEventId === null
    ? { id: existing.id, created: false }
    : undefined
}

/**
 * Accepts: the row first (the unique index refuses a second decision), then the copy with
 * the row's id as `transactionId`, then the copy's ids on the row. A copy refused before
 * anything was created takes its new row back; any other failure may have reached Graph,
 * so the row stays, and a retry (or the next sync) makes the copy under the same
 * `transactionId`. For a series, the cancelled dates within the horizon are removed from
 * the copy right away.
 */
async function accept(
  context: Calendar.Context,
  { userId, source, eventId }: Decide,
): Promise<Calendar.Outcome<Calendar.DecisionResponse>> {
  const { db, accounts, main, now } = context
  const reader = readers.readerFor(source, accounts)
  const target = await copies.readTarget(reader, eventId)
  if (!target) {
    return noSuchEvent
  }
  const verdict = await offerability(context, { reader, target })
  if (verdict === 'present') {
    return { refusal: 'conflict', message: 'Already in your calendar' }
  }
  if (verdict !== 'offered') {
    return noSuchEvent
  }
  const row = await acceptRow(db, { userId, source, eventId })
  if (!row) {
    return decidedAlready
  }
  const copy = await copies.createCopy(main, target, row.id).catch(async (error: unknown) => {
    if (row.created && refusedBeforeCreating(error)) {
      await db
        .delete(calendarDecisions)
        .where(and(eq(calendarDecisions.id, row.id), isNull(calendarDecisions.copyEventId)))
    }
    throw error
  })
  if (!(await copies.recordCopy(db, { rowId: row.id, target }, copy))) {
    // Undone (or dismissed) while the copy was being made
    await main.provider.deleteEvent(main.connection, copy.id)
    return { refusal: 'conflict', message: 'Undone in the meantime' }
  }
  if (target.kind === 'series') {
    const removing = { main, copyId: copy.id, series: target.series }
    await copies
      .removeCancelledDates(removing, { from: now, to: suggestions.horizonEnd(now) })
      .catch((error: unknown) => {
        // The next full sync tries again
        console.warn('Removing cancelled dates from a new copy failed', error)
      })
  }
  const event = target.kind === 'single' && copy.event
  return {
    result: 'created',
    body: {
      id: row.id,
      decision: 'accepted',
      ...(event ? { event: { ...event, source: { name: source.name } } } : {}),
    },
  }
}

/**
 * Takes over an accept that left no copy (it failed): such an accept may still have
 * reached Graph, so the copy is made again under its `transactionId` (Graph answers the
 * one it has) and deleted, before the row turns into a dismissal that no sync repairs.
 */
async function takeOver(
  { db, main }: Calendar.Context,
  { reader, row }: { reader: Calendar.SourceReader; row: DecisionRow },
): Promise<Calendar.Outcome<Calendar.DecisionResponse>> {
  const target = await copies.readTarget(reader, row.sourceEventId)
  if (target) {
    const copy = await copies.createCopy(main, target, row.id)
    await main.provider.deleteEvent(main.connection, copy.id)
  }
  const [taken] = await db
    .update(calendarDecisions)
    .set({ decision: 'dismissed' })
    .where(
      and(
        eq(calendarDecisions.id, row.id),
        eq(calendarDecisions.decision, 'accepted'),
        isNull(calendarDecisions.copyEventId),
      ),
    )
    .returning({ id: calendarDecisions.id })
  return taken
    ? { result: 'created', body: { id: taken.id, decision: 'dismissed' } }
    : decidedAlready
}

/**
 * Not for me: final, only Undo brings the event back. It takes over an accept that left
 * no copy (it failed), so a later sync does not make one after all.
 */
async function dismiss(
  context: Calendar.Context,
  { userId, source, eventId }: Decide,
): Promise<Calendar.Outcome<Calendar.DecisionResponse>> {
  const { db, accounts } = context
  const reader = readers.readerFor(source, accounts)
  if (!(await copies.lookUp(reader, eventId))) {
    return noSuchEvent
  }
  const [row] = await db
    .insert(calendarDecisions)
    .values({ userId, sourceId: source.id, sourceEventId: eventId, decision: 'dismissed' })
    .onConflictDoNothing()
    .returning({ id: calendarDecisions.id })
  if (row) {
    return { result: 'created', body: { id: row.id, decision: 'dismissed' } }
  }
  const existing = await existingRow(db, { source, eventId })
  return existing?.decision === 'accepted' && existing.copyEventId === null
    ? takeOver(context, { reader, row: existing })
    : decidedAlready
}

/** Decides about an event of one of the user's sources. */
async function decide(
  context: Calendar.Context,
  userId: string,
  { sourceId, eventId, decision }: Calendar.DecisionRequest,
): Promise<Calendar.Outcome<Calendar.DecisionResponse>> {
  const source = await activeSource(context.db, userId, sourceId)
  if (!source) {
    return { refusal: 'not-found', message: 'No such calendar source' }
  }
  const request = { userId, source, eventId }
  return decision === 'accept' ? accept(context, request) : dismiss(context, request)
}

/**
 * Undoes a decision: deletes the copy when there is one, then the row, so the event is
 * suggested again.
 */
async function undo(
  { db, main }: Calendar.Context,
  userId: string,
  id: string,
): Promise<Calendar.Outcome> {
  if (!isUuid(id)) {
    return noSuchDecision
  }
  const [row] = await db
    .select({ copyEventId: calendarDecisions.copyEventId })
    .from(calendarDecisions)
    .where(and(eq(calendarDecisions.id, id), eq(calendarDecisions.userId, userId)))
  if (!row) {
    return noSuchDecision
  }
  if (row.copyEventId) {
    await main.provider.deleteEvent(main.connection, row.copyEventId)
  }
  await db
    .delete(calendarDecisions)
    .where(and(eq(calendarDecisions.id, id), eq(calendarDecisions.userId, userId)))
  return { result: 'done', body: undefined }
}

const decisions = { parseRequest, decide, undo }

export default decisions
