import calendarLocale from '#shared/utils/calendar-locale'
import isRecord from '#shared/utils/is-record'

/*
 * One line on how a series repeats, from Graph's `patternedRecurrence` (which the demo
 * calendars use too): "Every week on Monday", "Every 2 weeks on Tuesday and Thursday,
 * until 20 Dec", "Every month on the 1st, 10 times". Anything else is "Repeats".
 */

const LOCALE = calendarLocale
const FALLBACK = 'Repeats'
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const UNITS: Record<string, string> = {
  daily: 'day',
  weekly: 'week',
  absoluteMonthly: 'month',
  relativeMonthly: 'month',
  absoluteYearly: 'year',
  relativeYearly: 'year',
}
const ORDINAL_SUFFIXES: Record<Intl.LDMLPluralRule, string> = {
  zero: 'th',
  one: 'st',
  two: 'nd',
  few: 'rd',
  many: 'th',
  other: 'th',
}
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const FIRST_MONTH = 1
const LAST_MONTH = 12
/** Any year will do to name a month. */
const SOME_YEAR = 2000

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function positive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

function capitalized(word: string): string {
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`
}

/** "Monday", "Tuesday and Thursday", "Monday, Wednesday and Friday", Monday first. */
function dayList(days: unknown): string | undefined {
  if (!Array.isArray(days)) {
    return undefined
  }
  const known = WEEKDAYS.filter(day => days.includes(day)).map(day => capitalized(day))
  if (known.length === 0 || known.length !== days.length) {
    return undefined
  }
  const last = known.at(-1)
  return known.length === 1 ? last : `${known.slice(0, -1).join(', ')} and ${last}`
}

/** "1st", "22nd", "13th". */
function ordinal(value: number): string {
  const rule = new Intl.PluralRules(LOCALE, { type: 'ordinal' }).select(value)
  return `${value}${ORDINAL_SUFFIXES[rule]}`
}

function monthName(month: unknown): string | undefined {
  const number = positive(month)
  if (number === undefined || number < FIRST_MONTH || number > LAST_MONTH) {
    return undefined
  }
  return new Intl.DateTimeFormat(LOCALE, { month: 'long', timeZone: 'UTC' }).format(
    Date.UTC(SOME_YEAR, number - 1, 1),
  )
}

/** "Every week", "Every 2 weeks". */
function every(unit: string, interval: number): string {
  return interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`
}

/** " on Monday", " on the 1st", " on the first Monday", " on 14 March"; empty for daily. */
function when(pattern: Record<string, unknown>): string | undefined {
  const days = dayList(pattern.daysOfWeek)
  const index = text(pattern.index) ?? 'first'
  const dayOfMonth = positive(pattern.dayOfMonth)
  const month = monthName(pattern.month)
  switch (pattern.type) {
    case 'daily': {
      return ''
    }
    case 'weekly': {
      return days === undefined ? undefined : ` on ${days}`
    }
    case 'absoluteMonthly': {
      return dayOfMonth === undefined ? undefined : ` on the ${ordinal(dayOfMonth)}`
    }
    case 'relativeMonthly': {
      return days === undefined ? undefined : ` on the ${index} ${days}`
    }
    case 'absoluteYearly': {
      return dayOfMonth === undefined || month === undefined
        ? undefined
        : ` on ${dayOfMonth} ${month}`
    }
    case 'relativeYearly': {
      return days === undefined || month === undefined
        ? undefined
        : ` on the ${index} ${days} of ${month}`
    }
    default: {
      return undefined
    }
  }
}

/** "20 Dec", with the year when it is not the year the series starts in. */
function shortDate(date: string, startDate: string | undefined): string {
  const sameYear = startDate?.slice(0, 'YYYY'.length) === date.slice(0, 'YYYY'.length)
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

/** ", until 20 Dec", ", 10 times", or nothing for a series without end. */
function until(range: unknown): string | undefined {
  if (!isRecord(range)) {
    return ''
  }
  if (range.type === 'endDate') {
    const endDate = text(range.endDate)
    return endDate && DATE_PATTERN.test(endDate)
      ? `, until ${shortDate(endDate, text(range.startDate))}`
      : undefined
  }
  if (range.type === 'numbered') {
    const count = positive(range.numberOfOccurrences)
    return count === undefined ? undefined : `, ${count} ${count === 1 ? 'time' : 'times'}`
  }
  return ''
}

/** How the series repeats, in one line. */
function recurrenceSummary(recurrence: unknown): string {
  if (!isRecord(recurrence) || !isRecord(recurrence.pattern)) {
    return FALLBACK
  }
  const { pattern } = recurrence
  const unit = typeof pattern.type === 'string' ? UNITS[pattern.type] : undefined
  const interval = pattern.interval === undefined ? 1 : positive(pattern.interval)
  const on = when(pattern)
  const end = until(recurrence.range)
  if (!unit || interval === undefined || on === undefined || end === undefined) {
    return FALLBACK
  }
  return `${every(unit, interval)}${on}${end}`
}

export default recurrenceSummary
