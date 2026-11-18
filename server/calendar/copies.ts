import { and, eq, isNull, or } from 'drizzle-orm'
import { calendarDecisions } from '../db/schema'
import calendarTime from '#shared/utils/calendar-time'
import isGone from '#shared/utils/is-gone'

/*
 * Copies of source events in the main calendar: what one is made from, making it under
 * the decision row's id as `transactionId`, and recording it on the row. Used by accept
 * and the takeover of a failed accept (`decisions.ts`), and by the repair of an accept
 * that stopped half way (`sync.ts`).
 */

/**
 * The event a decision names, if the source has it: a single event or a series master.
 * An id the source does not know, and the id of a single occurrence of a series
 * (decisions name the series), are `undefined`. One call.
 */
async function lookUp(
  reader: Calendar.SourceReader,
  eventId: string,
): Promise<Calendar.DetailedEvent | undefined> {
  const [found] = await reader.getEvents([eventId])
  if (!found || isGone(found) || (!found.seriesMaster && found.seriesMasterId)) {
    return undefined
  }
  return found
}

/** What a copy of the named event is made from, or `undefined` when the source does not have it. */
async function readTarget(
  reader: Calendar.SourceReader,
  eventId: string,
): Promise<Calendar.CopyTarget | undefined> {
  const found = await lookUp(reader, eventId)
  if (!found?.seriesMaster) {
    return found && { kind: 'single', event: found }
  }
  const [series] = await reader.getSeriesContent([eventId])
  return series && { kind: 'series', series }
}

/** The source's version the copy is made from, and when a single event ends (series run on). */
function sourceFields(target: Calendar.CopyTarget): {
  sourceVersion: string | null
  sourceEnd: Date | null
} {
  return target.kind === 'single'
    ? {
        sourceVersion: target.event.version,
        sourceEnd: new Date(calendarTime.spanOf(target.event).end),
      }
    : // eslint-disable-next-line unicorn/no-null
      { sourceVersion: target.series.version, sourceEnd: null }
}

/** Makes the copy in the main calendar. The row's id is the `transactionId`: a retry makes no second copy. */
function createCopy(
  main: Calendar.Account,
  target: Calendar.CopyTarget,
  rowId: string,
): ReturnType<Calendar.Provider['createEvent']> {
  const content = target.kind === 'single' ? target.event.content : target.series.content
  return main.provider.createEvent(main.connection, content, rowId)
}

/**
 * Records the copy on its row, only while the row is still an accept without a copy (or
 * with this one, after a retry). Resolves to `false` when it was undone or dismissed in
 * the meantime; the caller deletes the copy then.
 */
async function recordCopy(
  db: Calendar.Context['db'],
  { rowId, target }: { rowId: string; target: Calendar.CopyTarget },
  copy: { id: string; version: string | null },
): Promise<boolean> {
  const withoutOtherCopy = or(
    isNull(calendarDecisions.copyEventId),
    eq(calendarDecisions.copyEventId, copy.id),
  )
  const recorded = await db
    .update(calendarDecisions)
    .set({ copyEventId: copy.id, copyVersion: copy.version, ...sourceFields(target) })
    .where(
      and(
        eq(calendarDecisions.id, rowId),
        eq(calendarDecisions.decision, 'accepted'),
        withoutOtherCopy,
      ),
    )
    .returning({ id: calendarDecisions.id })
  return recorded.length > 0
}

/**
 * Removes the cancelled dates of a series within [from, to) from its copy. Resolves to
 * how many occurrences it deleted; `limit` caps them.
 */
async function removeCancelledDates(
  {
    main,
    copyId,
    series,
  }: {
    main: Calendar.Account
    copyId: string
    series: Pick<Calendar.Series, 'cancelledDates' | 'recurrenceTimeZone'>
  },
  { from, to, limit = Number.POSITIVE_INFINITY }: { from: Date; to: Date; limit?: number },
): Promise<number> {
  const first = calendarTime.dateOf(from)
  const last = calendarTime.dateOf(to)
  const dates = series.cancelledDates.filter(date => date >= first && date < last)
  let deleted = 0
  for (const date of dates) {
    if (deleted >= limit) {
      break
    }
    // One at a time: each is a call to the same mailbox
    // eslint-disable-next-line eslint/no-await-in-loop
    const occurrence = await main.provider.findOccurrence(main.connection, {
      seriesId: copyId,
      date,
      timeZone: series.recurrenceTimeZone ?? 'UTC',
    })
    if (occurrence) {
      // eslint-disable-next-line eslint/no-await-in-loop
      await main.provider.deleteEvent(main.connection, occurrence)
      deleted += 1
    }
  }
  return deleted
}

const copies = { lookUp, readTarget, createCopy, recordCopy, removeCancelledDates }

export default copies
