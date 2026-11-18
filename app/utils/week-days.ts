import formatEventTime from './format-event-time'
import week from './week'

/*
 * The week list's days: own events and suggestions interleaved by start, at most three
 * suggestions per day (the active one always among them), and runs of free days
 * collapsed into one heading. Today is never collapsed.
 */

interface WeekInput {
  monday: string
  events: readonly Calendar.CalendarEvent[]
  suggestions: readonly Calendar.Suggestion[]
  timeZone: string
  /** Today's date in the zone. */
  today: string
  activeKey?: string
}

const SUGGESTIONS_PER_DAY = 3

/** Sorts a day: all-day events first, then by start; own events before suggestions at the same time. */
function order(row: CalendarView.Row): [number, number, number] {
  const event = row.kind === 'event' ? row.event : row.suggestion.event
  return [
    event.allDay ? 0 : 1,
    event.allDay ? 0 : Date.parse(event.start),
    row.kind === 'event' ? 0 : 1,
  ]
}

function compareRows(first: CalendarView.Row, second: CalendarView.Row): number {
  const [a1, b1, c1] = order(first)
  const [a2, b2, c2] = order(second)
  return a1 - a2 || b1 - b2 || c1 - c2
}

/** The suggestions a day shows: the first three, with the active one swapped in when it comes later. */
function visibleSuggestions(
  list: readonly Calendar.Suggestion[],
  activeKey: string | undefined,
): { shown: Calendar.Suggestion[]; hidden: Calendar.Suggestion[] } {
  const shown = list.slice(0, SUGGESTIONS_PER_DAY)
  const active = list.find(entry => entry.key === activeKey)
  if (active && !shown.includes(active)) {
    shown.splice(SUGGESTIONS_PER_DAY - 1, 1, active)
  }
  return { shown, hidden: list.filter(entry => !shown.includes(entry)) }
}

/** The days of the week an event covers: from its first day (or Monday) to its last (or Sunday). */
function daysOf(
  event: Calendar.Event,
  { monday, timeZone }: { monday: string; timeZone: string },
): string[] {
  const first = formatEventTime.dayOf(event, timeZone)
  const last = formatEventTime.lastDayOf(event, timeZone)
  return week.days(monday).filter(date => date >= first && date <= last)
}

/**
 * The week's days. An event that runs over several days has a row on each of them, so
 * such a day is never free. A suggestion sits on its first day only.
 */
function groupWeek({
  monday,
  events,
  suggestions,
  timeZone,
  today,
  activeKey,
}: WeekInput): CalendarView.Group[] {
  const eventRows = Map.groupBy(
    events.flatMap(event =>
      daysOf(event, { monday, timeZone }).map(date => ({
        date,
        row: { kind: 'event' as const, key: `event:${event.id}:${date}`, event },
      })),
    ),
    entry => entry.date,
  )
  const suggestionsByDay = Map.groupBy(suggestions, suggestion => {
    const first = formatEventTime.dayOf(suggestion.event, timeZone)
    return first < monday ? monday : first
  })
  const groups: CalendarView.Group[] = []
  for (const date of week.days(monday)) {
    const { shown, hidden } = visibleSuggestions(suggestionsByDay.get(date) ?? [], activeKey)
    const rows: CalendarView.Row[] = [
      ...(eventRows.get(date) ?? []).map(entry => entry.row),
      ...shown.map(suggestion => ({
        kind: 'suggestion' as const,
        key: suggestion.key,
        suggestion,
      })),
    ].toSorted(compareRows)
    const isToday = date === today
    const previous = groups.at(-1)
    if (rows.length === 0 && !isToday) {
      if (previous?.kind === 'free') {
        previous.to = date
      } else {
        groups.push({ kind: 'free', from: date, to: date })
      }
      continue
    }
    groups.push({
      kind: 'day',
      date,
      today: isToday,
      rows,
      moreFrom: [...new Set(hidden.map(entry => entry.source.name))],
    })
  }
  return groups
}

export default groupWeek
