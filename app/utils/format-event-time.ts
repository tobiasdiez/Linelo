import calendarLocale from '#shared/utils/calendar-locale'
import calendarTime from '#shared/utils/calendar-time'
import week from './week'

/*
 * Event times as the calendar shows them, in the viewer's zone (`timeZone`), in the
 * formats of `calendarLocale`: "09:00 – 10:00", "All day", "09:00 → 12 Nov", "until 16:00".
 */

function clock(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat(calendarLocale, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instant))
}

/** "12 Nov". */
function shortDate(date: string): string {
  return new Intl.DateTimeFormat(calendarLocale, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  }).format(calendarTime.dayStart(date))
}

/** "Thu". */
function shortWeekday(date: string): string {
  return new Intl.DateTimeFormat(calendarLocale, { timeZone: 'UTC', weekday: 'short' }).format(
    calendarTime.dayStart(date),
  )
}

/** The date the event starts on, in the zone for timed events. */
function dayOf(event: Pick<Calendar.Event, 'start' | 'allDay'>, timeZone: string): string {
  return event.allDay ? event.start : week.dateIn(event.start, timeZone)
}

/** The last date the event covers: an all-day event ends the day before its end, a timed one on the day of its last minute. */
function lastDayOf(
  event: Pick<Calendar.Event, 'start' | 'end' | 'allDay'>,
  timeZone: string,
): string {
  const last = event.allDay
    ? calendarTime.addDays(event.end, -1)
    : week.dateIn(Date.parse(event.end) - 1, timeZone)
  const first = dayOf(event, timeZone)
  return last < first ? first : last
}

/**
 * The time column of an event's row on `day` (its first day when left out): "09:00 – 10:00"
 * and "All day" for an event of one day; for one that runs on, "09:00 → 12 Nov" on its first
 * day, "All day" in between, and "until 16:00" on the last day of a timed one.
 */
function timeRange(
  event: Calendar.Event,
  { timeZone, day }: { timeZone: string; day?: string },
): string {
  const first = dayOf(event, timeZone)
  const last = lastDayOf(event, timeZone)
  const shownOn = day ?? first
  if (last === first) {
    return event.allDay
      ? 'All day'
      : `${clock(event.start, timeZone)} – ${clock(event.end, timeZone)}`
  }
  if (shownOn <= first) {
    return `${event.allDay ? 'All day' : clock(event.start, timeZone)} → ${shortDate(last)}`
  }
  return shownOn === last && !event.allDay ? `until ${clock(event.end, timeZone)}` : 'All day'
}

/** Whether the row on `day` continues an event that started on an earlier day. */
function continues(
  event: Calendar.Event,
  { timeZone, day }: { timeZone: string; day: string },
): boolean {
  return dayOf(event, timeZone) < day
}

/** With the weekday, for the bottom bar: "Thu 18:00 – 20:00", "Sat, all day". */
function withWeekday(event: Calendar.Event, timeZone: string): string {
  const weekday = shortWeekday(dayOf(event, timeZone))
  const range = timeRange(event, { timeZone })
  return range === 'All day' ? `${weekday}, all day` : `${weekday} ${range}`
}

/**
 * How a series repeats, in running text and short, as a one-line row has room for:
 * "every Wednesday", "every 2 weeks on Thursday, until 20 Dec".
 */
function pattern(series: Calendar.Suggestion['series']): string | undefined {
  const summary = series?.summary
  return (
    summary &&
    `${summary.charAt(0).toLowerCase()}${summary.slice(1)}`.replace(/^every week on /, 'every ')
  )
}

const formatEventTime = { clock, dayOf, lastDayOf, timeRange, continues, withWeekday, pattern }

export default formatEventTime
