import * as schema from '#server/db/schema'
import MailError from '#server/mail/mail-error'
import calendarTime from '#shared/utils/calendar-time'
import mailFakes from './mail-fakes'
import testDatabase from './test-database'
import { vi } from 'vite-plus/test'

/** An event of a calendar; times as UTC instants. */
function event(overrides: Partial<Calendar.Event> & { id: string }): Calendar.Event {
  return {
    iCalUId: `${overrides.id}-ical`,
    title: overrides.id,
    start: '2026-11-19T17:00:00Z',
    end: '2026-11-19T19:00:00Z',
    allDay: false,
    cancelled: false,
    private: false,
    exception: false,
    version: 'v1',
    ...overrides,
  }
}

/** A single event with the content of its copy. */
function detailed(source: Calendar.Event): Calendar.DetailedEvent {
  return {
    ...source,
    seriesMaster: false,
    content: {
      subject: source.title,
      body: { contentType: 'html', content: `<p>${source.title}</p>` },
      start: calendarTime.utcTime(source.start),
      end: calendarTime.utcTime(source.end),
      isAllDay: source.allDay,
      ...(source.location ? { location: source.location } : {}),
    },
  }
}

/** A weekly series whose copy starts at `start`. */
function series(
  overrides: Partial<Calendar.SeriesWithContent> & { id: string; start?: string; end?: string },
): Calendar.SeriesWithContent {
  const { start = '2026-11-19T09:30:00Z', end = '2026-11-19T10:30:00Z', ...rest } = overrides
  const recurrence = {
    pattern: { type: 'weekly', interval: 1, daysOfWeek: ['thursday'] },
    range: { type: 'noEnd', startDate: calendarTime.dateOf(start) },
  }
  return {
    version: 'v1',
    cancelled: false,
    recurrence,
    recurrenceTimeZone: 'W. Europe Standard Time',
    summary: 'Every week on Thursday',
    cancelledDates: [],
    content: {
      subject: overrides.id,
      body: { contentType: 'html', content: '' },
      start: calendarTime.utcTime(start),
      end: calendarTime.utcTime(end),
      isAllDay: false,
      recurrence,
    },
    ...rest,
  }
}

interface FakeCalendar {
  events: Calendar.Event[]
  /** What `getEvents` answers; defaults to `detailed` of the listed event. */
  details: Map<string, Calendar.DetailedEvent>
  series: Map<string, Calendar.SeriesWithContent>
  /** Makes every call to the calendar fail. */
  failure?: Error
}

interface Copy {
  content: Calendar.EventContent
  version: number
  transactionId: string
}

/** A provider whose calendars and copies the test controls, with spies on every call. */
function fakeProvider() {
  const calendars = new Map<string, FakeCalendar>()
  const main: Calendar.Event[] = []
  const copies = new Map<string, Copy>()
  const deletedOccurrences: string[] = []
  let created = 0

  /** Adds a calendar the account lists. */
  function addCalendar(id: string): FakeCalendar {
    const added: FakeCalendar = { events: [], details: new Map(), series: new Map() }
    calendars.set(id, added)
    return added
  }

  /** A calendar added before; any other id is a mistake in the test. */
  function calendar(id: string): FakeCalendar {
    const found = calendars.get(id)
    if (!found) {
      throw new Error(`The test has no calendar ${id}`)
    }
    return found
  }

  function readable(id: string): FakeCalendar {
    const found = calendar(id)
    if (found.failure) {
      throw found.failure
    }
    return found
  }

  function copyEvent(id: string, copy: Copy): Calendar.Event {
    return event({
      id,
      title: copy.content.subject,
      start: `${copy.content.start.dateTime}Z`,
      end: `${copy.content.end.dateTime}Z`,
      version: `copy-v${copy.version}`,
      webLink: `https://outlook.example/${id}`,
    })
  }

  function detailedOf(source: FakeCalendar, id: string): Calendar.DetailedEvent | Calendar.Gone {
    const listed = source.events.find(entry => entry.id === id)
    const found = source.details.get(id) ?? (listed && detailed(listed))
    if (found) {
      return found
    }
    const master = source.series.get(id)
    return master
      ? { ...detailed(event({ id })), seriesMaster: true, version: master.version }
      : { id, gone: true }
  }

  const provider = {
    calendarScopes: ['Calendars.ReadWrite'],
    listCalendars: vi.fn<Calendar.Provider['listCalendars']>(async () => [
      { externalId: 'calendar-main', name: 'Calendar', isDefault: true },
      ...[...calendars.keys()].map(externalId => ({
        externalId,
        name: externalId,
        isDefault: false,
      })),
    ]),
    reader: vi.fn<Calendar.Provider['reader']>((_connection, calendarId) => ({
      listEvents: vi.fn<Calendar.SourceReader['listEvents']>(async range =>
        readable(calendarId).events.filter(
          entry => entry.start < range.to && entry.end > range.from,
        ),
      ),
      getSeries: vi.fn<Calendar.SourceReader['getSeries']>(async ids => {
        const source = readable(calendarId)
        return ids.flatMap(id => {
          const found = source.series.get(id)
          if (!found) {
            return []
          }
          const { content: _content, ...rest } = found
          return [rest]
        })
      }),
      getSeriesContent: vi.fn<Calendar.SourceReader['getSeriesContent']>(async ids => {
        const source = readable(calendarId)
        return ids.flatMap(id => {
          const found = source.series.get(id)
          return found ? [found] : []
        })
      }),
      getEvents: vi.fn<Calendar.SourceReader['getEvents']>(async ids => {
        const source = readable(calendarId)
        return ids.map(id => detailedOf(source, id))
      }),
    })),
    listMainEvents: vi.fn<Calendar.Provider['listMainEvents']>(async (_connection, range) => [
      ...main.filter(entry => entry.start < range.to && entry.end > range.from),
      ...[...copies.entries()].map(([id, copy]) => copyEvent(id, copy)),
    ]),
    getMainEvents: vi.fn<Calendar.Provider['getMainEvents']>(async (_connection, ids) =>
      ids.map(id => {
        const copy = copies.get(id)
        return copy ? copyEvent(id, copy) : { id, gone: true }
      }),
    ),
    createEvent: vi.fn<Calendar.Provider['createEvent']>(
      async (_connection, content, transactionId) => {
        const existing = [...copies.entries()].find(
          ([, copy]) => copy.transactionId === transactionId,
        )
        const id = existing?.[0] ?? `copy-${(created += 1)}`
        if (!existing) {
          copies.set(id, { content, version: 1, transactionId })
        }
        const copy = copies.get(id)
        if (!copy) {
          throw new Error('The fake lost a copy')
        }
        return {
          id,
          version: `copy-v${copy.version}`,
          ...(content.recurrence === undefined ? { event: copyEvent(id, copy) } : {}),
        }
      },
    ),
    updateEvent: vi.fn<Calendar.Provider['updateEvent']>(async (_connection, eventId, content) => {
      const copy = copies.get(eventId)
      if (!copy) {
        throw new MailError('unavailable', 'No such copy')
      }
      copy.content = { ...copy.content, ...content }
      copy.version += 1
      return { version: `copy-v${copy.version}` }
    }),
    deleteEvent: vi.fn<Calendar.Provider['deleteEvent']>(async (_connection, eventId) => {
      if (!copies.delete(eventId)) {
        deletedOccurrences.push(eventId)
      }
    }),
    findOccurrence: vi.fn<Calendar.Provider['findOccurrence']>(
      async (_connection, { seriesId, date }) =>
        copies.has(seriesId) ? `${seriesId}@${date}` : undefined,
    ),
  } satisfies Calendar.Provider

  /** The user edits the copy in Outlook: its version changes. */
  function editCopy(id: string, content: Partial<Calendar.EventContent>): void {
    const copy = copies.get(id)
    if (!copy) {
      throw new Error(`The test has no copy ${id}`)
    }
    copy.content = { ...copy.content, ...content }
    copy.version += 1
  }

  return { provider, addCalendar, calendar, main, copies, deletedOccurrences, editCopy }
}

type FakeProvider = ReturnType<typeof fakeProvider>

/**
 * A database with Mara and her Microsoft account, a fake provider for it, and a way to
 * add her sources; plus another user with a source of their own.
 */
async function calendarSetup() {
  const database = await testDatabase()
  const { db } = database
  const [mara, other] = await db
    .insert(schema.users)
    .values([
      { email: 'mara@northwind.co', displayName: 'Mara Lindqvist' },
      { email: 'jonas@northwind.co', displayName: 'Jonas Weber' },
    ])
    .returning()
  if (!mara || !other) {
    throw new Error('Users were not created')
  }
  const [maraAccount, otherAccount] = await db
    .insert(schema.accounts)
    .values([
      { userId: mara.id, providerId: 'microsoft', accountId: 'mara' },
      { userId: other.id, providerId: 'microsoft', accountId: 'jonas' },
    ])
    .returning()
  if (!maraAccount || !otherAccount) {
    throw new Error('Accounts were not created')
  }
  // Narrowed above; the closure below would see them as possibly undefined again
  const maraId = mara.id
  const maraAccountId = maraAccount.id
  const fake: FakeProvider = fakeProvider()
  const account: Calendar.Account = {
    providerId: 'microsoft',
    provider: fake.provider,
    connection: mailFakes.connection(maraAccount.id),
  }

  async function addSource(
    externalId: string,
    { name = externalId, userId = maraId, accountId = maraAccountId } = {},
  ): Promise<string> {
    const [row] = await db
      .insert(schema.calendarSources)
      .values({ userId, kind: 'outlook', accountId, externalId, name })
      .returning()
    if (!row) {
      throw new Error('Source was not created')
    }
    fake.addCalendar(externalId)
    return row.id
  }

  function dependencies(now: Date): Calendar.Context {
    return { db, accounts: [account], main: account, now }
  }

  return {
    db,
    userId: mara.id,
    otherUserId: other.id,
    otherAccountId: otherAccount.id,
    account,
    fake,
    addSource,
    dependencies,
  }
}

/** The body of a result; a refusal fails the test with its message. */
function bodyOf<Body>(outcome: Calendar.Outcome<Body>): Body {
  if ('refusal' in outcome) {
    throw new Error(`Refused (${outcome.refusal}): ${outcome.message}`)
  }
  return outcome.body
}

const calendarFakes = { event, detailed, series, fakeProvider, setup: calendarSetup, bodyOf }

export default calendarFakes
