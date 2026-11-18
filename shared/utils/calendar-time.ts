/*
 * Times and dates of the calendar, shared by the server and the app: calendar dates are
 * `YYYY-MM-DD`, instants ISO 8601 in UTC.
 */

const MILLISECONDS_PER_MINUTE = 60_000
const MILLISECONDS_PER_HOUR = 3_600_000
const MILLISECONDS_PER_DAY = 86_400_000
const DAYS_PER_WEEK = 7
const DATE_LENGTH = 'YYYY-MM-DD'.length
const HALF_DAY = MILLISECONDS_PER_DAY / 2
/** How far ahead the next occurrence of a series is looked for, when a copy starts from it. */
const NEXT_OCCURRENCE_DAYS = 400

/** UTC midnight of a date, in milliseconds, for date arithmetic. */
function dayStart(date: string): number {
  return Date.parse(`${date}T00:00:00Z`)
}

/** The UTC date of an instant (or of milliseconds). */
function dateOf(instant: string | number | Date): string {
  return new Date(instant).toISOString().slice(0, DATE_LENGTH)
}

function addDays(date: string, count: number): string {
  return dateOf(dayStart(date) + count * MILLISECONDS_PER_DAY)
}

/** An ISO instant without milliseconds: `2026-11-19T17:00:00Z`. */
function isoInstant(time: string | number | Date): string {
  return new Date(time).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** A UTC wall time as Graph takes it: `{ dateTime: '2026-11-19T17:00:00', timeZone: 'UTC' }`. */
function utcTime(instant: string): { dateTime: string; timeZone: string } {
  return { dateTime: isoInstant(instant).replace(/Z$/, ''), timeZone: 'UTC' }
}

/**
 * The instants an event spans, for comparing it with instant ranges. An all-day event on
 * dates [D, E) spans [D 12:00Z, E 12:00Z - 1 day]: inside a range of local midnights
 * exactly when its dates are, for any zone between UTC-12 and UTC+12 (the 12-hour rule).
 */
function spanOf(event: Pick<Calendar.Event, 'start' | 'end' | 'allDay'>): {
  start: number
  end: number
} {
  if (!event.allDay) {
    return { start: Date.parse(event.start), end: Date.parse(event.end) }
  }
  const start = dayStart(event.start) + HALF_DAY
  return { start, end: Math.max(start, dayStart(event.end) - HALF_DAY) }
}

/** Sorts events by where they start, all-day events at midday UTC. */
function byStart<Item>(items: readonly Item[], eventOf: (item: Item) => Calendar.Event): Item[] {
  return items.toSorted(
    (first, second) => spanOf(eventOf(first)).start - spanOf(eventOf(second)).start,
  )
}

const calendarTime = {
  MILLISECONDS_PER_MINUTE,
  MILLISECONDS_PER_HOUR,
  MILLISECONDS_PER_DAY,
  DAYS_PER_WEEK,
  DATE_LENGTH,
  HALF_DAY,
  NEXT_OCCURRENCE_DAYS,
  dayStart,
  dateOf,
  addDays,
  isoInstant,
  utcTime,
  spanOf,
  byStart,
}

export default calendarTime
