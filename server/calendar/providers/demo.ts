import MailError from '../../mail/mail-error'
import calendarTime from '#shared/utils/calendar-time'
import createCalendarFixtures from '#shared/data/calendar-fixtures'
import isRecord from '#shared/utils/is-record'
import recurrenceSummary from '../recurrence-summary'

/*
 * Development only: the demo account's calendars behind the same interface as a real
 * account, so the whole flow runs without Microsoft credentials. Copies live in memory
 * and reset with the dev server (or `reset`, which the demo sign-in calls).
 */

type FixtureCalendar = ReturnType<typeof createCalendarFixtures>[number]
type FixtureSeries = FixtureCalendar['series'][number]

/** A series as the demo expands it: weekly, every `interval` weeks from its first occurrence. */
interface Weekly {
  id: string
  title: string
  location?: string
  /** The first occurrence, as instants. */
  start: string
  end: string
  intervalWeeks: number
  /** The last date an occurrence may fall on, `YYYY-MM-DD`. */
  until?: string
  cancelledDates: ReadonlySet<string>
  version: string | null
}

interface Copy {
  content: Calendar.EventContent
  version: number
  /** Occurrences of a series copy deleted on their own. */
  cancelledDates: Set<string>
}

interface DemoAccount {
  copies: Map<string, Copy>
  /** Copies by the transaction they were created in, so a retried create makes no second copy. */
  transactions: Map<string, string>
}

interface Dependencies {
  /** The time the demo calendars are relative to. */
  now?: () => Date
}

const { DAYS_PER_WEEK, DATE_LENGTH, MILLISECONDS_PER_DAY, dateOf, isoInstant, utcTime } =
  calendarTime
/** No series in the demo runs longer than this. */
const MAX_OCCURRENCES = 520

/** Whether the event overlaps the range; all-day dates count from UTC midnight, which is close enough for the demo. */
function overlaps(
  event: Pick<Calendar.Event, 'start' | 'end'>,
  { from, to }: Calendar.Range,
): boolean {
  const start = Date.parse(event.start)
  const end = Date.parse(event.end)
  return start < Date.parse(to) && (end > Date.parse(from) || start >= Date.parse(from))
}

function addDays(instant: string, days: number): string {
  return isoInstant(Date.parse(instant) + days * MILLISECONDS_PER_DAY)
}

/** The occurrences of a weekly series from its first one, up to `until` or `limit`. */
function occurrences(
  series: Weekly,
  limit: string,
): { start: string; end: string; date: string }[] {
  const found: { start: string; end: string; date: string }[] = []
  const last = Date.parse(limit)
  for (let index = 0; index < MAX_OCCURRENCES; index += 1) {
    const offset = index * series.intervalWeeks * DAYS_PER_WEEK
    const start = addDays(series.start, offset)
    const date = dateOf(start)
    // As instants: a range may name them with an offset (`+01:00`)
    if (Date.parse(start) >= last || (series.until !== undefined && date > series.until)) {
      break
    }
    if (!series.cancelledDates.has(date)) {
      found.push({ start, end: addDays(series.end, offset), date })
    }
  }
  return found
}

function occurrenceEvents(series: Weekly, range: Calendar.Range): Calendar.Event[] {
  return occurrences(series, range.to)
    .filter(entry => overlaps(entry, range))
    .map(({ start, end, date }) => ({
      id: `${series.id}-${date}`,
      seriesMasterId: series.id,
      iCalUId: `${series.id}-${date}-ical`,
      title: series.title,
      start,
      end,
      allDay: false,
      location: series.location,
      cancelled: false,
      private: false,
      exception: false,
      version: series.version,
    }))
}

function fixtureWeekly(series: FixtureSeries): Weekly {
  return {
    id: series.id,
    title: series.title,
    ...(series.location ? { location: series.location } : {}),
    start: series.start,
    end: series.end,
    intervalWeeks: series.recurrence.pattern.interval,
    ...(series.recurrence.range.endDate ? { until: series.recurrence.range.endDate } : {}),
    cancelledDates: new Set(series.cancelledDates),
    version: `${series.id}-v1`,
  }
}

function instantOf({ dateTime }: { dateTime: string }): string {
  return `${dateTime.slice(0, 'YYYY-MM-DDTHH:mm:ss'.length)}Z`
}

function contentOf(event: Calendar.Event): Calendar.EventContent {
  return {
    subject: event.title,
    body: { contentType: 'text', content: '' },
    start: event.allDay
      ? { dateTime: `${event.start}T00:00:00`, timeZone: 'UTC' }
      : utcTime(event.start),
    end: event.allDay ? { dateTime: `${event.end}T00:00:00`, timeZone: 'UTC' } : utcTime(event.end),
    isAllDay: event.allDay,
    ...(event.location ? { location: event.location } : {}),
  }
}

/** The weekly pattern of a copy, as `contentOf` and `getSeriesContent` write it. */
function intervalOf(recurrence: unknown): number {
  const pattern = isRecord(recurrence) ? recurrence.pattern : undefined
  return isRecord(pattern) && typeof pattern.interval === 'number' ? pattern.interval : 1
}

function untilOf(recurrence: unknown): string | undefined {
  const range = isRecord(recurrence) ? recurrence.range : undefined
  return isRecord(range) && typeof range.endDate === 'string' ? range.endDate : undefined
}

function copyEvent(id: string, copy: Copy): Calendar.Event {
  const { content } = copy
  const start = content.isAllDay ? dateOf(content.start.dateTime) : instantOf(content.start)
  const end = content.isAllDay ? dateOf(content.end.dateTime) : instantOf(content.end)
  return {
    id,
    iCalUId: `${id}-ical`,
    title: content.subject,
    start,
    end,
    allDay: content.isAllDay,
    ...(content.location ? { location: content.location } : {}),
    cancelled: false,
    private: false,
    exception: false,
    version: `${id}-v${copy.version}`,
  }
}

function copyWeekly(id: string, copy: Copy): Weekly {
  const event = copyEvent(id, copy)
  const until = untilOf(copy.content.recurrence)
  return {
    id,
    title: event.title,
    ...(event.location ? { location: event.location } : {}),
    start: event.start,
    end: event.end,
    intervalWeeks: intervalOf(copy.content.recurrence),
    ...(until ? { until } : {}),
    cancelledDates: copy.cancelledDates,
    version: event.version,
  }
}

function seriesOf(source: FixtureCalendar, id: string): FixtureSeries | undefined {
  return source.series.find(entry => entry.id === id)
}

function toSeries(series: FixtureSeries): Calendar.Series {
  return {
    id: series.id,
    version: `${series.id}-v1`,
    cancelled: false,
    recurrence: series.recurrence,
    recurrenceTimeZone: 'UTC',
    summary: recurrenceSummary(series.recurrence),
    cancelledDates: [...series.cancelledDates],
  }
}

function createDemoCalendarProvider({
  now = () => new Date(),
}: Dependencies = {}): Calendar.Provider & {
  /** Forgets every copy, as a restart of the dev server would. */
  reset: () => void
} {
  const accounts = new Map<string, DemoAccount>()

  function account(connection: Mail.Connection): DemoAccount {
    let found = accounts.get(connection.account.id)
    if (!found) {
      found = { copies: new Map(), transactions: new Map() }
      accounts.set(connection.account.id, found)
    }
    return found
  }

  function calendars(): FixtureCalendar[] {
    return createCalendarFixtures(now())
  }

  function calendar(calendarId: string): FixtureCalendar {
    const found = calendars().find(entry => entry.id === calendarId)
    if (!found) {
      throw new MailError('unavailable', `The demo has no calendar ${calendarId}`)
    }
    return found
  }

  /** The series copied from its next occurrence that has not ended yet. */
  function withContent(series: FixtureSeries): Calendar.SeriesWithContent {
    const weekly = fixtureWeekly(series)
    const current = now().toISOString()
    const next = occurrences(
      { ...weekly, cancelledDates: new Set() },
      addDays(current, calendarTime.NEXT_OCCURRENCE_DAYS),
    ).find(entry => entry.end > current)
    const start = next?.start ?? series.start
    const end = next?.end ?? series.end
    return {
      ...toSeries(series),
      content: {
        subject: series.title,
        body: { contentType: 'text', content: '' },
        start: utcTime(start),
        end: utcTime(end),
        isAllDay: false,
        ...(series.location ? { location: series.location } : {}),
        recurrence: {
          ...series.recurrence,
          range: { ...series.recurrence.range, startDate: dateOf(start) },
        },
      },
    }
  }

  function reader(_connection: Mail.Connection, calendarId: string): Calendar.SourceReader {
    return {
      async listEvents(range) {
        const source = calendar(calendarId)
        return [
          ...source.events.filter(entry => overlaps(entry, range)),
          ...source.series.flatMap(series => occurrenceEvents(fixtureWeekly(series), range)),
        ].toSorted((first, second) => first.start.localeCompare(second.start))
      },
      async getSeries(ids) {
        const source = calendar(calendarId)
        return ids.flatMap(id => {
          const series = seriesOf(source, id)
          return series ? [toSeries(series)] : []
        })
      },
      async getSeriesContent(ids) {
        const source = calendar(calendarId)
        return ids.flatMap(id => {
          const series = seriesOf(source, id)
          return series ? [withContent(series)] : []
        })
      },
      async getEvents(ids) {
        const source = calendar(calendarId)
        return ids.map(id => detailedOf(source, id))
      },
    }
  }

  /** An event of a source by id: a single event, a series master, or gone (occurrence ids included). */
  function detailedOf(source: FixtureCalendar, id: string): Calendar.DetailedEvent | Calendar.Gone {
    const found = source.events.find(entry => entry.id === id)
    if (found) {
      return { ...found, seriesMaster: false, content: contentOf(found) }
    }
    const series = seriesOf(source, id)
    const [first] = series
      ? occurrenceEvents(fixtureWeekly(series), {
          from: series.start,
          to: addDays(series.start, 1),
        })
      : []
    if (!series || !first) {
      return { id, gone: true }
    }
    const { seriesMasterId: _master, ...fields } = first
    return { ...fields, id, seriesMaster: true, content: withContent(series).content }
  }

  function mainEvents(connection: Mail.Connection, range: Calendar.Range): Calendar.Event[] {
    const main = calendars().find(entry => entry.isDefault)
    const copies = [...account(connection).copies.entries()].flatMap(([id, copy]) =>
      copy.content.recurrence === undefined
        ? [copyEvent(id, copy)].filter(entry => overlaps(entry, range))
        : occurrenceEvents(copyWeekly(id, copy), range),
    )
    return [...(main?.events ?? []).filter(entry => overlaps(entry, range)), ...copies].toSorted(
      (first, second) => first.start.localeCompare(second.start),
    )
  }

  return {
    // The demo account needs no scopes
    calendarScopes: [],
    async listCalendars() {
      return calendars().map(({ id, name, isDefault }) => ({ externalId: id, name, isDefault }))
    },
    reader,
    async listMainEvents(connection, range) {
      return mainEvents(connection, range)
    },
    async getMainEvents(connection, ids) {
      const fixtures = calendars().find(entry => entry.isDefault)?.events ?? []
      return ids.map(id => {
        const copy = account(connection).copies.get(id)
        if (copy) {
          return copyEvent(id, copy)
        }
        return fixtures.find(entry => entry.id === id) ?? { id, gone: true }
      })
    },
    async createEvent(connection, content, transactionId) {
      const demo = account(connection)
      const id = demo.transactions.get(transactionId) ?? `copy-${transactionId}`
      if (!demo.copies.has(id)) {
        demo.copies.set(id, { content, version: 1, cancelledDates: new Set() })
        demo.transactions.set(transactionId, id)
      }
      const copy = demo.copies.get(id)
      if (!copy) {
        throw new MailError('unavailable', `The demo lost the copy ${id}`)
      }
      // Like Graph: the copy of a single event comes back readable, a series in its own zone does not
      return {
        id,
        version: `${id}-v${copy.version}`,
        ...(content.recurrence === undefined ? { event: copyEvent(id, copy) } : {}),
      }
    },
    async updateEvent(connection, eventId, content) {
      const copy = account(connection).copies.get(eventId)
      if (!copy) {
        throw new MailError('unavailable', `The demo has no event ${eventId}`)
      }
      copy.content = { ...copy.content, ...content }
      copy.version += 1
      return { version: `${eventId}-v${copy.version}` }
    },
    async deleteEvent(connection, eventId) {
      const { copies } = account(connection)
      if (!copies.delete(eventId)) {
        // An occurrence of a series copy: `<copy id>-<date>`
        const seriesId = eventId.slice(0, -DATE_LENGTH - 1)
        copies.get(seriesId)?.cancelledDates.add(eventId.slice(-DATE_LENGTH))
      }
    },
    async findOccurrence(connection, { seriesId, date }) {
      const copy = account(connection).copies.get(seriesId)
      const found =
        copy &&
        occurrences(copyWeekly(seriesId, copy), addDays(`${date}T00:00:00Z`, 1)).some(
          entry => entry.date === date,
        )
      return found ? `${seriesId}-${date}` : undefined
    },
    reset() {
      accounts.clear()
    },
  }
}

export default createDemoCalendarProvider
