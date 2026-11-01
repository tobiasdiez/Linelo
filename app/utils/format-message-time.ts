// TODO: Follow the user's locale preference once settings exist
const LOCALE = 'en-GB'
const MILLISECONDS_PER_DAY = 86_400_000
const RECENT_DAYS = 7

/** Days since 1970 of the calendar date `date` falls on in `timeZone`. */
function calendarDay(date: Date, timeZone: string | undefined): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date)
  function part(type: Intl.DateTimeFormatPartTypes): number {
    return Number(parts.find(entry => entry.type === type)?.value)
  }
  return Date.UTC(part('year'), part('month') - 1, part('day')) / MILLISECONDS_PER_DAY
}

/**
 * A short, relative timestamp: "Today, 09:14", "Yesterday, 17:02", "Mon 11:40"
 * within the last week, otherwise "12 Mar, 09:14".
 * `timeZone` defaults to the viewer's own.
 */
function short(date: Date, now: Date, timeZone?: string): string {
  const time = new Intl.DateTimeFormat(LOCALE, { timeZone, hour: '2-digit', minute: '2-digit' })
  const daysAgo = calendarDay(now, timeZone) - calendarDay(date, timeZone)
  if (daysAgo === 0) {
    return `Today, ${time.format(date)}`
  }
  if (daysAgo === 1) {
    return `Yesterday, ${time.format(date)}`
  }
  if (daysAgo > 1 && daysAgo < RECENT_DAYS) {
    const weekday = new Intl.DateTimeFormat(LOCALE, { timeZone, weekday: 'short' })
    return `${weekday.format(date)} ${time.format(date)}`
  }
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/** The full date and time, for example "Thursday, 12 March 2026 at 09:14". */
function full(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(date)
}

const formatMessageTime = { short, full }

export default formatMessageTime
