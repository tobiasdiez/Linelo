import type {
  DateTimeTimeZone,
  Event as GraphEvent,
  NullableOption,
} from '@microsoft/microsoft-graph-types'
import calendarTime from '#shared/utils/calendar-time'
import isRecord from '#shared/utils/is-record'
import recurrenceSummary from '../recurrence-summary'

/*
 * Parses Graph's events into `Calendar.*`. Listings are asked for in UTC (no time zone
 * preference), so every `dateTime` is a UTC wall time without an offset.
 */

/** Graph's way of saying "a legacy custom zone": copies fall back to UTC for these. */
const CUSTOM_ZONES = /^tzone:\/\/|^Customized Time Zone$/i
const DATE_IN_OCCURRENCE_ID = /\.(?<date>\d{4}-\d{2}-\d{2})$/
const NO_TITLE = 'No title'
const { DATE_LENGTH, HALF_DAY, isoInstant, utcTime } = calendarTime

/** Graph's own shape for an event; every property is optional, as Graph only sends what `$select` asked for. */
function isGraphEvent(value: unknown): value is GraphEvent {
  return isRecord(value)
}

/**
 * The instant of a UTC wall time such as `2026-11-19T17:00:00.0000000`, or `undefined`,
 * also for a wall time in another zone (Graph answers a created event in the zone it was given).
 */
function utcInstant(value: NullableOption<DateTimeTimeZone> | undefined): Date | undefined {
  const wallTime = value?.dateTime
  if (!wallTime || (value.timeZone && value.timeZone !== 'UTC')) {
    return undefined
  }
  const hasOffset = /(?:Z|[+-]\d{2}:\d{2})$/.test(wallTime)
  const date = new Date(hasOffset ? wallTime : `${wallTime}Z`)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/**
 * The date of an all-day boundary. Graph sends midnight in the event's own zone, converted
 * to UTC when asked for UTC; 12 hours later is the right date for zones between UTC-11
 * and UTC+12 (a documented limitation). A boundary in another zone is that zone's date.
 */
function allDayDate(value: NullableOption<DateTimeTimeZone> | undefined): string | undefined {
  const zone = value?.timeZone ?? 'UTC'
  if (zone !== 'UTC') {
    return value?.dateTime?.slice(0, DATE_LENGTH)
  }
  const date = utcInstant(value)
  return date && calendarTime.dateOf(date.getTime() + HALF_DAY)
}

/** A zone a copy can be created in: a named zone, not a legacy custom one. */
function plainZone(zone: NullableOption<string> | undefined): string | undefined {
  return zone && !CUSTOM_ZONES.test(zone) ? zone : undefined
}

/** Parses one event of a listing, or `undefined` when it lacks what the calendar needs. */
function parseEvent(value: unknown): Calendar.Event | undefined {
  if (!isGraphEvent(value) || !value.id) {
    return undefined
  }
  const allDay = value.isAllDay === true
  const startDate = utcInstant(value.start)
  const endDate = utcInstant(value.end)
  const start = allDay ? allDayDate(value.start) : startDate && isoInstant(startDate)
  const end = allDay ? allDayDate(value.end) : endDate && isoInstant(endDate)
  if (!start || !end) {
    return undefined
  }
  const location = value.location?.displayName?.trim()
  return {
    id: value.id,
    ...(value.seriesMasterId ? { seriesMasterId: value.seriesMasterId } : {}),
    iCalUId: value.iCalUId ?? value.id,
    title: value.subject?.trim() || NO_TITLE,
    start,
    end,
    allDay,
    ...(location ? { location } : {}),
    cancelled: value.isCancelled === true,
    private: Boolean(value.sensitivity && value.sensitivity !== 'normal'),
    exception: value.type === 'exception',
    // Graph and the database have no `undefined`
    // eslint-disable-next-line unicorn/no-null
    version: value.changeKey ?? null,
    ...(value.webLink ? { webLink: value.webLink } : {}),
    ...(value.originalStartTimeZone ? { originalTimeZone: value.originalStartTimeZone } : {}),
  }
}

/** The events of a collection response (`{ value: [...] }`) or of a list of entries. */
function parseEvents(entries: readonly unknown[]): Calendar.Event[] {
  return entries.map(entry => parseEvent(entry)).filter(entry => entry !== undefined)
}

/** Midnight of a date in the event's zone, for all-day copies. */
function allDayTime(
  date: string,
  zone: string | undefined,
): { dateTime: string; timeZone: string } {
  return { dateTime: `${date}T00:00:00`, timeZone: plainZone(zone) ?? 'UTC' }
}

function body(value: GraphEvent): Calendar.EventContent['body'] {
  return {
    contentType: value.body?.contentType === 'text' ? 'text' : 'html',
    content: value.body?.content ?? '',
  }
}

/** A single event with the content of its copy: single events are copied from their UTC instants. */
function parseDetailed(value: unknown): Calendar.DetailedEvent | undefined {
  const event = parseEvent(value)
  if (!event || !isGraphEvent(value)) {
    return undefined
  }
  const content: Calendar.EventContent = {
    subject: event.title,
    body: body(value),
    start: event.allDay ? allDayTime(event.start, event.originalTimeZone) : utcTime(event.start),
    end: event.allDay ? allDayTime(event.end, event.originalTimeZone) : utcTime(event.end),
    isAllDay: event.allDay,
    ...(event.location ? { location: event.location } : {}),
  }
  return { ...event, seriesMaster: value.type === 'seriesMaster', content }
}

/** The dates of `cancelledOccurrences` entries (`OID.<master id>.2026-11-26`). */
function cancelledDates(entries: readonly string[] | undefined): string[] {
  return (entries ?? []).flatMap(entry => {
    const date = DATE_IN_OCCURRENCE_ID.exec(entry)?.groups?.date
    return date ? [date] : []
  })
}

/**
 * The zone a series repeats in: the recurrence's own, else the event's. A legacy custom
 * zone falls back to UTC (`undefined`), so its copy may drift an hour across DST.
 */
function recurrenceZone(value: GraphEvent): string | undefined {
  return plainZone(value.recurrence?.range?.recurrenceTimeZone ?? value.originalStartTimeZone)
}

/** A series master, read in UTC. */
function parseSeries(value: unknown): Calendar.Series | undefined {
  if (!isGraphEvent(value) || !value.id || !value.recurrence) {
    return undefined
  }
  const zone = recurrenceZone(value)
  return {
    id: value.id,
    // Graph and the database have no `undefined`
    // eslint-disable-next-line unicorn/no-null
    version: value.changeKey ?? null,
    cancelled: value.isCancelled === true,
    recurrence: value.recurrence,
    ...(zone ? { recurrenceTimeZone: zone } : {}),
    summary: recurrenceSummary(value.recurrence),
    cancelledDates: cancelledDates(value.cancelledOccurrences),
  }
}

/** A local wall time as Graph sent it in the series' zone, or `undefined`. */
function zonedTime(
  value: NullableOption<DateTimeTimeZone> | undefined,
): { dateTime: string; timeZone: string } | undefined {
  return value?.dateTime && value.timeZone
    ? { dateTime: value.dateTime, timeZone: value.timeZone }
    : undefined
}

/** The earliest occurrence of an `instances` page, with its times in the series' zone. */
function firstOccurrence(entries: readonly unknown[]): GraphEvent | undefined {
  return entries
    .filter((entry): entry is GraphEvent => isGraphEvent(entry) && Boolean(entry.start?.dateTime))
    .toSorted((first, second) =>
      (first.start?.dateTime ?? '').localeCompare(second.start?.dateTime ?? ''),
    )
    .at(0)
}

/**
 * The content of a series copy: the master's subject, body and location, with the start
 * and end of `next` (its next occurrence, in the series' zone) and the pattern moved to
 * start on that date, so a series running since 2023 does not add three years of history.
 * Without a next occurrence the master's own times (`zonedMaster`) and pattern are kept.
 */
function seriesContent(
  master: unknown,
  zonedMaster: unknown,
  next: GraphEvent | undefined,
): Calendar.EventContent | undefined {
  if (!isGraphEvent(master) || !master.recurrence || !isGraphEvent(zonedMaster)) {
    return undefined
  }
  const timing = next ?? zonedMaster
  const start = zonedTime(timing.start)
  const end = zonedTime(timing.end)
  if (!start || !end) {
    return undefined
  }
  const startDate = start.dateTime.slice(0, DATE_LENGTH)
  const recurrence = next
    ? { ...master.recurrence, range: { ...master.recurrence.range, startDate } }
    : master.recurrence
  const location = master.location?.displayName?.trim()
  return {
    subject: master.subject?.trim() || NO_TITLE,
    body: body(master),
    start,
    end,
    isAllDay: master.isAllDay === true,
    ...(location ? { location } : {}),
    recurrence,
  }
}

const microsoftEvents = {
  isGraphEvent,
  parseEvent,
  parseEvents,
  parseDetailed,
  parseSeries,
  seriesContent,
  firstOccurrence,
}

export default microsoftEvents
