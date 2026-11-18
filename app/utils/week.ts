import calendarLocale from '#shared/utils/calendar-locale'
import calendarTime from '#shared/utils/calendar-time'

/*
 * Weeks as calendar dates (`YYYY-MM-DD`, Monday first) and the instants they span in a
 * time zone. Pure; the zone is always passed in, so the calendar page can use the
 * viewer's and the tests a pinned one.
 */

const MILLISECONDS_PER_SECOND = 1000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const { DAYS_PER_WEEK, addDays, dayStart: dayNumber, dateOf } = calendarTime

function isDate(value: unknown): value is string {
  return typeof value === 'string' && DATE_PATTERN.test(value) && dateOf(dayNumber(value)) === value
}

/** The calendar date an instant falls on in the zone. */
function dateIn(instant: Date | number | string, timeZone: string): string {
  // `en-CA` writes dates as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant))
}

/** How far the zone's wall clock is ahead of UTC at the instant, in milliseconds. */
function offsetAt(time: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(time)
  function part(type: Intl.DateTimeFormatPartTypes): number {
    return Number(parts.find(entry => entry.type === type)?.value)
  }
  const wall = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  )
  return wall - Math.floor(time / MILLISECONDS_PER_SECOND) * MILLISECONDS_PER_SECOND
}

/** The instant of a date's midnight in the zone, DST included. */
function midnight(date: string, timeZone: string): string {
  const guess = dayNumber(date)
  const first = guess - offsetAt(guess, timeZone)
  // Again from the first answer, in case a DST change lies between the two
  return new Date(guess - offsetAt(first, timeZone)).toISOString()
}

/** The Monday of a date's week. */
function mondayOf(date: string): string {
  const weekday = (new Date(dayNumber(date)).getUTCDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK
  return addDays(date, -weekday)
}

/** The Monday of the current week in the zone. */
function currentWeek(now: Date, timeZone: string): string {
  return mondayOf(dateIn(now, timeZone))
}

/** `?week=` as the Monday of that date's week, or the current week for anything else. */
function parseWeek(value: unknown, currentMonday: string): string {
  const [first] = Array.isArray(value) ? value : [value]
  return isDate(first) ? mondayOf(first) : currentMonday
}

/** The instants the week spans in the zone, `to` exclusive: what `GET /api/calendar/week` gets. */
function instants(monday: string, timeZone: string): Calendar.Range {
  return {
    from: midnight(monday, timeZone),
    to: midnight(addDays(monday, DAYS_PER_WEEK), timeZone),
  }
}

/** The seven dates of the week. */
function days(monday: string): string[] {
  return Array.from({ length: DAYS_PER_WEEK }, (_, index) => addDays(monday, index))
}

function format(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(calendarLocale, { ...options, timeZone: 'UTC' }).format(
    dayNumber(date),
  )
}

/** "9 – 15 November 2026", "30 November – 6 December 2026", "29 December 2025 – 4 January 2026". */
function rangeLabel(monday: string): string {
  const sunday = addDays(monday, DAYS_PER_WEEK - 1)
  const sameYear = monday.slice(0, 'YYYY'.length) === sunday.slice(0, 'YYYY'.length)
  const sameMonth =
    sameYear && monday.slice(0, 'YYYY-MM'.length) === sunday.slice(0, 'YYYY-MM'.length)
  const end = format(sunday, { day: 'numeric', month: 'long', year: 'numeric' })
  let start = format(monday, { day: 'numeric' })
  if (!sameMonth) {
    start = format(monday, {
      day: 'numeric',
      month: 'long',
      ...(sameYear ? {} : { year: 'numeric' }),
    })
  }
  return `${start} – ${end}`
}

/** "Monday 9 Nov" (built from parts: ICU versions differ on the comma after the weekday). */
function dayLabel(date: string): string {
  return `${format(date, { weekday: 'long' })} ${format(date, { day: 'numeric', month: 'short' })}`
}

/** A run of free days: "Friday 13 – Sunday 15 Nov", "Saturday 31 Oct – Sunday 1 Nov". */
function runLabel(first: string, last: string): string {
  const sameMonth = first.slice(0, 'YYYY-MM'.length) === last.slice(0, 'YYYY-MM'.length)
  const start = sameMonth
    ? `${format(first, { weekday: 'long' })} ${format(first, { day: 'numeric' })}`
    : dayLabel(first)
  return `${start} – ${dayLabel(last)}`
}

const week = {
  addDays,
  dateIn,
  midnight,
  mondayOf,
  currentWeek,
  parseWeek,
  instants,
  days,
  rangeLabel,
  dayLabel,
  runLabel,
}

export default week
