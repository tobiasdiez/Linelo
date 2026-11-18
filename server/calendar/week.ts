import { calendarDecisions, calendarSources } from '../db/schema'
import calendarTime from '#shared/utils/calendar-time'
import { eq } from 'drizzle-orm'
import isRecord from '#shared/utils/is-record'
import readers from './readers'
import sources from './sources'
import suggestions from './suggestions'
import uniqueById from '#shared/utils/unique-by-id'

/** A week, with room for the hour a DST change adds. */
const MAX_RANGE_DAYS = 8
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/

function isInstant(value: unknown): value is string {
  return typeof value === 'string' && INSTANT.test(value) && !Number.isNaN(Date.parse(value))
}

/** Reads `?from=&to=`: two instants, `to` after `from`, at most 8 days apart; or says what is wrong. */
function parseRange(value: unknown): Calendar.Range | string {
  const problem = 'from and to must be ISO instants, from before to, at most 8 days apart'
  if (!isRecord(value) || !isInstant(value.from) || !isInstant(value.to)) {
    return problem
  }
  const length = Date.parse(value.to) - Date.parse(value.from)
  return length > 0 && length <= MAX_RANGE_DAYS * calendarTime.MILLISECONDS_PER_DAY
    ? { from: value.from, to: value.to }
    : problem
}

function iso(time: number): string {
  return new Date(time).toISOString()
}

/**
 * What to read: the week, and the tail from `max(to, now)` up to the horizon for the
 * footer line. A week at or after today reads one range up to the horizon; a past week
 * reads the tail apart; a week beyond the horizon reads only itself.
 */
function readRanges(
  range: Calendar.Range,
  now: Date,
): { reads: Calendar.Range[]; tail?: Calendar.Range } {
  const to = Date.parse(range.to)
  const horizon = suggestions.horizonEnd(now).getTime()
  const tailStart = Math.max(to, now.getTime())
  if (tailStart >= horizon) {
    return { reads: [range] }
  }
  const tail = { from: iso(tailStart), to: iso(horizon) }
  return tailStart === to
    ? { reads: [{ from: range.from, to: tail.to }], tail }
    : { reads: [range, tail], tail }
}

/** The user's decisions: their keys, and the source names of the copies by copy id. */
async function decided(
  db: Calendar.Context['db'],
  userId: string,
): Promise<{ keys: Set<string>; copies: Map<string, string> }> {
  const rows = await db
    .select({
      sourceId: calendarDecisions.sourceId,
      sourceEventId: calendarDecisions.sourceEventId,
      copyEventId: calendarDecisions.copyEventId,
      name: calendarSources.name,
    })
    .from(calendarDecisions)
    .innerJoin(calendarSources, eq(calendarSources.id, calendarDecisions.sourceId))
    .where(eq(calendarDecisions.userId, userId))
  return {
    keys: new Set(rows.map(row => suggestions.keyOf(row.sourceId, row.sourceEventId))),
    copies: new Map(rows.flatMap(row => (row.copyEventId ? [[row.copyEventId, row.name]] : []))),
  }
}

/** A copy names its source: the decision whose copy it is, or whose series it belongs to. */
function withSource(
  event: Calendar.Event,
  copies: ReadonlyMap<string, string>,
): Calendar.CalendarEvent {
  const name = copies.get(event.seriesMasterId ?? event.id)
  return name ? { ...event, source: { name } } : event
}

/** How each suggested series repeats, by key. A source that fails to say leaves "Repeats". */
async function summaries(
  shown: readonly Calendar.Suggestion[],
  readerOf: ReadonlyMap<string, Calendar.SourceReader>,
): Promise<Map<string, string>> {
  const bySource = Map.groupBy(
    shown.filter(entry => entry.series),
    entry => entry.sourceId,
  )
  const lists = await Promise.all(
    [...bySource].map(async ([sourceId, entries]) => {
      const reader = readerOf.get(sourceId)
      const series = reader
        ? await reader.getSeries(entries.map(entry => entry.eventId)).catch((error: unknown) => {
            console.warn('Reading a series failed', error)
            return []
          })
        : []
      return series.map(entry => [suggestions.keyOf(sourceId, entry.id), entry.summary] as const)
    }),
  )
  return new Map(lists.flat())
}

/**
 * The week of the main calendar with the suggestions of the other calendars in it. The
 * main calendar and every source are read at once (one batch per account), for the range
 * extended to the 30-day horizon, which also answers `moreLater`. A source that fails is
 * named in `unreachable`; the main calendar failing fails the week.
 */
async function load(
  { db, accounts, main, now }: Calendar.Context,
  userId: string,
  range: Calendar.Range,
): Promise<Calendar.Outcome<Calendar.WeekResponse>> {
  const active = await sources.active(db, userId)
  const { reads, tail } = readRanges(range, now)
  // Asked for in one tick, so each account sends one batch
  const [mainLists, { reachable, unreachable }, { keys, copies }] = await Promise.all([
    Promise.all(reads.map(entry => main.provider.listMainEvents(main.connection, entry))),
    readers.readSources(active, accounts, reads),
    decided(db, userId),
  ])
  const mainEvents = uniqueById(mainLists.flat())
  const input = {
    range,
    now,
    sources: reachable.map(({ source, events }) => ({ source, events })),
    main: mainEvents,
    decided: keys,
  }
  const shown = suggestions.suggest(input)
  const readerOf = new Map(reachable.map(({ source, reader }) => [source.id, reader]))
  const moreLater = tail
    ? suggestions.suggest({
        ...input,
        range: tail,
        exclude: new Set(shown.map(entry => entry.key)),
      }).length > 0
    : false
  const events = calendarTime
    .byStart(
      mainEvents.filter(event => suggestions.overlapsRange(event, range)),
      event => event,
    )
    .map(event => withSource(event, copies))
  return {
    result: 'ok',
    body: {
      events,
      suggestions: suggestions.withSummaries(shown, await summaries(shown, readerOf)),
      moreLater,
      unreachable: unreachable.map(source => source.name),
      sourceCount: active.length,
    },
  }
}

const week = { parseRange, load, readRanges }

export default week
