import calendarTime from '#shared/utils/calendar-time'

/*
 * Which events of the other calendars to suggest, pure. An event is suggested when it
 * is still ahead, neither cancelled, private nor a moved occurrence, not in the main
 * calendar already (same iCalUId), and not decided. A series is one suggestion, at its
 * first occurrence in the range.
 */

/** How far ahead the footer line looks for more suggestions. */
const HORIZON_DAYS = 30

const { spanOf } = calendarTime

interface SourceEvents {
  source: { id: string; name: string }
  events: readonly Calendar.Event[]
}

interface Input {
  range: Calendar.Range
  now: Date
  /** Events of the active sources, read for (at least) the range. */
  sources: readonly SourceEvents[]
  /** Events of the main calendar for the same range. */
  main: readonly Calendar.Event[]
  /** Keys of the decided events (`<sourceId>:<sourceEventId>`). */
  decided: ReadonlySet<string>
  /** Keys to leave out, such as those the week shows already. */
  exclude?: ReadonlySet<string>
}

/**
 * Whether an event can be offered at all: `offered`, or why not. `hidden` covers what is
 * never shown (cancelled, private, a moved occurrence), `past` what is over, `present`
 * what the main calendar has already.
 */
type Verdict = 'offered' | 'hidden' | 'past' | 'present'

/** `<sourceId>:<sourceEventId>`, for a series its master. */
function keyOf(sourceId: string, eventId: string): string {
  return `${sourceId}:${eventId}`
}

/** Whether the event overlaps the range at all. */
function overlapsRange(event: Calendar.Event, range: Calendar.Range): boolean {
  const { start, end } = spanOf(event)
  const from = Date.parse(range.from)
  return start < Date.parse(range.to) && (end > from || start >= from)
}

/** Whether the event starts in the range: where a suggestion is shown. */
function startsIn(event: Calendar.Event, range: Calendar.Range): boolean {
  const { start } = spanOf(event)
  return start >= Date.parse(range.from) && start < Date.parse(range.to)
}

/** Still ahead: a timed event that has not started, an all-day one that has not ended. */
function isAhead(event: Calendar.Event, now: Date): boolean {
  return event.allDay
    ? calendarTime.dayStart(event.end) > now.getTime()
    : Date.parse(event.start) >= now.getTime()
}

/** The rules every suggestion passes, also checked when a decision names an event directly. */
function verdictOf(
  event: Calendar.Event,
  { now, main }: { now: Date; main: readonly Calendar.Event[] },
): Verdict {
  if (event.cancelled || event.private || event.exception) {
    return 'hidden'
  }
  if (!isAhead(event, now)) {
    return 'past'
  }
  return main.some(other => other.iCalUId === event.iCalUId) ? 'present' : 'offered'
}

/** Whether a timed event collides with one of the user's timed events. */
function collides(event: Calendar.Event, main: readonly Calendar.Event[]): boolean {
  if (event.allDay) {
    return false
  }
  const { start, end } = spanOf(event)
  return main.some(other => {
    if (other.allDay || other.cancelled) {
      return false
    }
    const span = spanOf(other)
    return span.start < end && span.end > start
  })
}

/**
 * The undecided events of the sources that start in the range, one per series (at its
 * first occurrence), sorted by start. A series says "Repeats" until `withSummaries` names its pattern.
 */
function suggest({
  range,
  now,
  sources,
  main,
  decided,
  exclude = new Set(),
}: Input): Calendar.Suggestion[] {
  const found = new Map<string, Calendar.Suggestion>()
  for (const { source, events } of sources) {
    const candidates = calendarTime.byStart(
      events.filter(
        event => startsIn(event, range) && verdictOf(event, { now, main }) === 'offered',
      ),
      event => event,
    )
    for (const event of candidates) {
      const eventId = event.seriesMasterId ?? event.id
      const key = keyOf(source.id, eventId)
      if (found.has(key) || decided.has(key) || exclude.has(key)) {
        continue
      }
      found.set(key, {
        key,
        sourceId: source.id,
        eventId,
        source: { name: source.name },
        event,
        ...(event.seriesMasterId ? { series: { summary: 'Repeats' } } : {}),
        overlaps: collides(event, main),
      })
    }
  }
  return calendarTime.byStart([...found.values()], suggestion => suggestion.event)
}

/** The suggestions with the patterns of their series, by key. */
function withSummaries(
  list: readonly Calendar.Suggestion[],
  summaries: ReadonlyMap<string, string>,
): Calendar.Suggestion[] {
  return list.map(suggestion => {
    const summary = suggestion.series && summaries.get(suggestion.key)
    return summary ? { ...suggestion, series: { summary } } : suggestion
  })
}

/** Where the footer line stops looking: 30 days from now. */
function horizonEnd(now: Date): Date {
  return new Date(now.getTime() + HORIZON_DAYS * calendarTime.MILLISECONDS_PER_DAY)
}

/** From now to the horizon: what the sync compares, and where a series is judged. */
function horizon(now: Date): Calendar.Range {
  return { from: now.toISOString(), to: horizonEnd(now).toISOString() }
}

const suggestions = {
  suggest,
  withSummaries,
  keyOf,
  verdictOf,
  overlapsRange,
  horizonEnd,
  horizon,
}

export default suggestions
