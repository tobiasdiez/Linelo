import { describe, expect, it } from 'vite-plus/test'
import calendarTime from '#shared/utils/calendar-time'
import createMicrosoftCalendarProvider from '#server/calendar/providers/microsoft'
import fakeGraphs from './fake-graph'
import httpStatus from '#shared/utils/http-status'
import mailFakes from './mail-fakes'

const NOW = new Date('2026-11-16T09:00:00Z')
const { url: GRAPH, graph: fakeGraph } = fakeGraphs
const WEEK = { from: '2026-11-15T23:00:00.000Z', to: '2026-11-22T23:00:00.000Z' }
const BERLIN = 'W. Europe Standard Time'
const IMMUTABLE_IDS = 'IdType="ImmutableId"'
const { MILLISECONDS_PER_DAY } = calendarTime

/** A Graph event as a UTC listing sends it. */
function graphEvent(fields: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'event-build-night',
    iCalUId: 'ical-build-night',
    subject: 'Build night',
    start: { dateTime: '2026-11-19T17:00:00.0000000', timeZone: 'UTC' },
    end: { dateTime: '2026-11-19T19:00:00.0000000', timeZone: 'UTC' },
    isAllDay: false,
    location: { displayName: 'Lab 2' },
    isCancelled: false,
    sensitivity: 'normal',
    type: 'singleInstance',
    changeKey: 'change-1',
    webLink: 'https://outlook.office365.com/owa/?itemid=event-build-night',
    originalStartTimeZone: BERLIN,
    ...fields,
  }
}

const weeklyOnThursday = {
  pattern: { type: 'weekly', interval: 1, daysOfWeek: ['thursday'], firstDayOfWeek: 'monday' },
  range: { type: 'noEnd', startDate: '2023-03-02', recurrenceTimeZone: BERLIN },
}

/** A series master as a UTC read sends it. */
function graphMaster(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'series-club',
    changeKey: 'series-change-1',
    isCancelled: false,
    subject: 'Club meeting',
    body: { contentType: 'html', content: '<p>Bring a laptop.</p>' },
    location: { displayName: 'Room 4.12' },
    isAllDay: false,
    start: { dateTime: '2023-03-02T17:00:00.0000000', timeZone: 'UTC' },
    end: { dateTime: '2023-03-02T18:00:00.0000000', timeZone: 'UTC' },
    recurrence: weeklyOnThursday,
    cancelledOccurrences: ['OID.series-club.2026-11-26', 'OID.series-club.2026-12-10'],
    originalStartTimeZone: BERLIN,
    ...fields,
  }
}

function provider(graph: ReturnType<typeof fakeGraph>) {
  return createMicrosoftCalendarProvider({ fetch: graph.fetch, now: () => NOW })
}

const { connection } = mailFakes

describe('microsoft calendar provider: calendars', () => {
  it("lists the account's calendars, the default one marked", async () => {
    expect.hasAssertions()
    const graph = fakeGraph(() => ({
      status: httpStatus.ok,
      body: {
        value: [
          { id: 'calendar-main', name: 'Calendar', isDefaultCalendar: true },
          { id: 'calendar-club', name: ' Robotics Club ', isDefaultCalendar: false },
          { name: 'Without an id' },
        ],
      },
    }))

    const calendars = await provider(graph).listCalendars(connection())

    expect(calendars).toStrictEqual([
      { externalId: 'calendar-main', name: 'Calendar', isDefault: true },
      { externalId: 'calendar-club', name: 'Robotics Club', isDefault: false },
    ])
    const [call] = graph.calls
    expect(call?.url.pathname).toBe('/v1.0/me/calendars')
    expect(call?.url.searchParams.get('$select')).toBe('id,name,isDefaultCalendar')
    expect(call?.headers.Prefer).toBe(IMMUTABLE_IDS)
  })
})

describe('microsoft calendar provider: calendar views', () => {
  it('reads the main calendar in UTC, with all-day dates by the 12-hour rule', async () => {
    expect.hasAssertions()
    const graph = fakeGraph(() => ({
      status: httpStatus.ok,
      body: {
        value: [
          graphEvent({}),
          graphEvent({
            id: 'event-holiday-berlin',
            iCalUId: 'ical-holiday-berlin',
            subject: 'Public holiday',
            isAllDay: true,
            // Midnight in Berlin, in UTC
            start: { dateTime: '2026-11-20T23:00:00.0000000', timeZone: 'UTC' },
            end: { dateTime: '2026-11-21T23:00:00.0000000', timeZone: 'UTC' },
          }),
          graphEvent({
            id: 'event-holiday-new-york',
            iCalUId: 'ical-holiday-new-york',
            subject: 'Thanksgiving trip',
            isAllDay: true,
            // Midnight in New York, in UTC
            start: { dateTime: '2026-11-21T05:00:00.0000000', timeZone: 'UTC' },
            end: { dateTime: '2026-11-23T05:00:00.0000000', timeZone: 'UTC' },
          }),
          { subject: 'No id, not an event' },
        ],
      },
    }))

    const events = await provider(graph).listMainEvents(connection(), WEEK)

    expect(events[0]).toStrictEqual({
      id: 'event-build-night',
      iCalUId: 'ical-build-night',
      title: 'Build night',
      start: '2026-11-19T17:00:00Z',
      end: '2026-11-19T19:00:00Z',
      allDay: false,
      location: 'Lab 2',
      cancelled: false,
      private: false,
      exception: false,
      version: 'change-1',
      webLink: 'https://outlook.office365.com/owa/?itemid=event-build-night',
      originalTimeZone: BERLIN,
    })
    expect(events.slice(1).map(event => [event.title, event.start, event.end])).toStrictEqual([
      ['Public holiday', '2026-11-21', '2026-11-22'],
      ['Thanksgiving trip', '2026-11-21', '2026-11-23'],
    ])
    const [[view] = []] = graph.batches()
    expect(view?.url.pathname).toBe('/v1.0/me/calendar/calendarView')
    expect(Object.fromEntries(view?.url.searchParams ?? [])).toMatchObject({
      startDateTime: WEEK.from,
      endDateTime: WEEK.to,
      $orderby: 'start/dateTime',
      $top: '100',
    })
    // No time zone preference: instants come in UTC
    expect(view?.headers.Prefer).toBe(IMMUTABLE_IDS)
  })

  it('keeps what decides whether an event is offered', async () => {
    expect.hasAssertions()
    const graph = fakeGraph(() => ({
      status: httpStatus.ok,
      body: {
        value: [
          graphEvent({
            id: 'occurrence-1',
            seriesMasterId: 'series-club',
            type: 'occurrence',
          }),
          graphEvent({ id: 'moved-1', seriesMasterId: 'series-club', type: 'exception' }),
          graphEvent({ id: 'private-1', sensitivity: 'private' }),
          graphEvent({ id: 'personal-1', sensitivity: 'personal' }),
          graphEvent({ id: 'cancelled-1', isCancelled: true }),
          graphEvent({ id: 'untitled-1', subject: '  ', location: { displayName: '' } }),
        ],
      },
    }))

    const events = await provider(graph).reader(connection(), 'calendar-club').listEvents(WEEK)

    expect(
      events.map(({ id, seriesMasterId, exception, cancelled, title, location, ...rest }) => [
        id,
        seriesMasterId,
        exception,
        rest.private,
        cancelled,
        title,
        location,
      ]),
    ).toStrictEqual([
      ['occurrence-1', 'series-club', false, false, false, 'Build night', 'Lab 2'],
      ['moved-1', 'series-club', true, false, false, 'Build night', 'Lab 2'],
      ['private-1', undefined, false, true, false, 'Build night', 'Lab 2'],
      ['personal-1', undefined, false, true, false, 'Build night', 'Lab 2'],
      ['cancelled-1', undefined, false, false, true, 'Build night', 'Lab 2'],
      ['untitled-1', undefined, false, false, false, 'No title', undefined],
    ])
  })

  it('follows nextLink to the following pages', async () => {
    expect.hasAssertions()
    const graph = fakeGraph(request => {
      const page = Number(request.url.searchParams.get('$skip') ?? '0')
      const next =
        page < 2
          ? {
              '@odata.nextLink': `${GRAPH}/me/calendars/calendar-club/calendarView?$skip=${page + 1}`,
            }
          : {}
      return {
        status: httpStatus.ok,
        body: { value: [graphEvent({ id: `event-page-${page}` })], ...next },
      }
    })

    const events = await provider(graph).reader(connection(), 'calendar-club').listEvents(WEEK)

    expect(events.map(event => event.id)).toStrictEqual([
      'event-page-0',
      'event-page-1',
      'event-page-2',
    ])
    expect(graph.calls.map(call => call.url.pathname)).toStrictEqual([
      '/v1.0/$batch',
      '/v1.0/me/calendars/calendar-club/calendarView',
      '/v1.0/me/calendars/calendar-club/calendarView',
    ])
    expect(graph.calls.at(-1)?.headers.Prefer).toBe(IMMUTABLE_IDS)
  })

  it('sends the views asked for at once in one batch, each failing on its own', async () => {
    expect.hasAssertions()
    const graph = fakeGraph(request => {
      if (request.url.pathname.includes('calendar-club')) {
        return { status: httpStatus.forbidden }
      }
      if (request.url.pathname.includes('calendar-seminar')) {
        return { status: httpStatus.internalServerError }
      }
      if (request.url.pathname.includes('calendar-gone')) {
        return { status: httpStatus.notFound }
      }
      return { status: httpStatus.ok, body: { value: [graphEvent({})] } }
    })
    const calendars = provider(graph)
    const mara = connection()

    const [main, club, seminar, gone] = await Promise.allSettled([
      calendars.listMainEvents(mara, WEEK),
      calendars.reader(mara, 'calendar-club').listEvents(WEEK),
      calendars.reader(mara, 'calendar-seminar').listEvents(WEEK),
      calendars.reader(mara, 'calendar-gone').listEvents(WEEK),
    ])

    expect(
      graph.batches().map(requests => requests.map(request => request.url.pathname)),
    ).toStrictEqual([
      [
        '/v1.0/me/calendar/calendarView',
        '/v1.0/me/calendars/calendar-club/calendarView',
        '/v1.0/me/calendars/calendar-seminar/calendarView',
        '/v1.0/me/calendars/calendar-gone/calendarView',
      ],
    ])
    expect(main).toMatchObject({ status: 'fulfilled', value: [{ id: 'event-build-night' }] })
    expect(club).toMatchObject({ status: 'rejected', reason: { kind: 'consent' } })
    expect(seminar).toMatchObject({ status: 'rejected', reason: { kind: 'unavailable' } })
    expect(gone).toMatchObject({ status: 'rejected', reason: { kind: 'unavailable' } })
  })

  it('sends one batch per account, and a later tick its own', async () => {
    expect.hasAssertions()
    const graph = fakeGraph(() => ({ status: httpStatus.ok, body: { value: [] } }))
    const calendars = provider(graph)

    await Promise.all([
      calendars.listMainEvents(connection('personal'), WEEK),
      calendars.listMainEvents(connection('office'), WEEK),
    ])
    await calendars.listMainEvents(connection('personal'), WEEK)

    expect(graph.batches().map(requests => requests.length)).toStrictEqual([1, 1, 1])
  })

  it('refreshes the token and sends the batch again when a view inside it is refused', async () => {
    expect.hasAssertions()
    const statuses = [httpStatus.unauthorized]
    const graph = fakeGraph(() => {
      const status = statuses.shift()
      return status ? { status } : { status: httpStatus.ok, body: { value: [graphEvent({})] } }
    })
    const mara = connection()

    const events = await provider(graph).listMainEvents(mara, WEEK)

    expect(events).toHaveLength(1)
    expect(graph.calls.map(call => call.headers.Authorization)).toStrictEqual([
      'Bearer stored-token',
      'Bearer refreshed-token',
    ])
  })

  it('fails every view of the batch when Graph does not answer', async () => {
    expect.hasAssertions()
    const graph = fakeGraph(() => ({ status: httpStatus.ok }), {
      status: () => httpStatus.serviceUnavailable,
    })
    const calendars = provider(graph)

    const outcomes = await Promise.allSettled([
      calendars.listMainEvents(connection(), WEEK),
      calendars.reader(connection(), 'calendar-club').listEvents(WEEK),
    ])

    expect(outcomes).toMatchObject([
      { status: 'rejected', reason: { kind: 'unavailable' } },
      { status: 'rejected', reason: { kind: 'unavailable' } },
    ])
  })
})

describe('microsoft calendar provider: events and series', () => {
  it('reads single events with the content of a copy, and says which are gone', async () => {
    expect.hasAssertions()
    const graph = fakeGraph(request => {
      const id = request.url.pathname.split('/').at(-1)
      if (id === 'event-build-night') {
        return {
          status: httpStatus.ok,
          body: graphEvent({ body: { contentType: 'html', content: '<p>Pizza</p>' } }),
        }
      }
      if (id === 'event-saturday') {
        return {
          status: httpStatus.ok,
          body: graphEvent({
            id: 'event-saturday',
            isAllDay: true,
            start: { dateTime: '2026-11-20T23:00:00.0000000', timeZone: 'UTC' },
            end: { dateTime: '2026-11-21T23:00:00.0000000', timeZone: 'UTC' },
          }),
        }
      }
      if (id === 'event-custom-zone') {
        return {
          status: httpStatus.ok,
          body: graphEvent({
            id: 'event-custom-zone',
            isAllDay: true,
            start: { dateTime: '2026-11-21T00:00:00.0000000', timeZone: 'UTC' },
            end: { dateTime: '2026-11-22T00:00:00.0000000', timeZone: 'UTC' },
            originalStartTimeZone: 'tzone://Microsoft/Custom',
          }),
        }
      }
      if (id === 'series-club') {
        return {
          status: httpStatus.ok,
          body: graphEvent({ id: 'series-club', type: 'seriesMaster' }),
        }
      }
      return { status: httpStatus.notFound }
    })

    const found = await provider(graph)
      .reader(connection(), 'calendar-club')
      .getEvents([
        'event-build-night',
        'event-saturday',
        'event-custom-zone',
        'series-club',
        'gone',
      ])

    expect(found).toMatchObject([
      {
        id: 'event-build-night',
        seriesMaster: false,
        content: {
          subject: 'Build night',
          body: { contentType: 'html', content: '<p>Pizza</p>' },
          start: { dateTime: '2026-11-19T17:00:00', timeZone: 'UTC' },
          end: { dateTime: '2026-11-19T19:00:00', timeZone: 'UTC' },
          isAllDay: false,
          location: 'Lab 2',
        },
      },
      {
        id: 'event-saturday',
        start: '2026-11-21',
        content: {
          start: { dateTime: '2026-11-21T00:00:00', timeZone: BERLIN },
          end: { dateTime: '2026-11-22T00:00:00', timeZone: BERLIN },
          isAllDay: true,
        },
      },
      {
        id: 'event-custom-zone',
        content: { start: { dateTime: '2026-11-21T00:00:00', timeZone: 'UTC' } },
      },
      { id: 'series-club', seriesMaster: true },
      { id: 'gone', gone: true },
    ])
    const [requests = []] = graph.batches()
    expect(requests[0]?.url.pathname).toBe(
      '/v1.0/me/calendars/calendar-club/events/event-build-night',
    )
    expect(requests[0]?.url.searchParams.get('$select')).toContain('body')
  })

  it('reads the copies in the main calendar by id', async () => {
    expect.hasAssertions()
    const graph = fakeGraph(request =>
      request.url.pathname.endsWith('/copy-1')
        ? { status: httpStatus.ok, body: graphEvent({ id: 'copy-1', changeKey: 'copy-change-2' }) }
        : { status: httpStatus.notFound },
    )

    const copies = await provider(graph).getMainEvents(connection(), ['copy-1', 'copy-2'])

    expect(copies).toMatchObject([
      { id: 'copy-1', version: 'copy-change-2' },
      { id: 'copy-2', gone: true },
    ])
    expect(graph.batches()[0]?.map(request => request.url.pathname)).toStrictEqual([
      '/v1.0/me/events/copy-1',
      '/v1.0/me/events/copy-2',
    ])
  })

  it('fails to read events when a part of the batch is refused', async () => {
    expect.hasAssertions()
    const graph = fakeGraph(() => ({ status: httpStatus.forbidden }))

    await expect(
      provider(graph).reader(connection(), 'calendar-club').getEvents(['event-1']),
    ).rejects.toMatchObject({ kind: 'consent' })
  })

  it('reads series masters: pattern, zone and cancelled dates', async () => {
    expect.hasAssertions()
    const graph = fakeGraph(request => {
      const id = request.url.pathname.split('/').at(-1)
      if (id === 'series-club') {
        return { status: httpStatus.ok, body: graphMaster() }
      }
      if (id === 'series-custom') {
        return {
          status: httpStatus.ok,
          body: graphMaster({
            id: 'series-custom',
            recurrence: { ...weeklyOnThursday, range: { type: 'noEnd', startDate: '2023-03-02' } },
            originalStartTimeZone: 'tzone://Microsoft/Custom',
            cancelledOccurrences: undefined,
          }),
        }
      }
      return { status: httpStatus.notFound }
    })

    const series = await provider(graph)
      .reader(connection(), 'calendar-club')
      .getSeries(['series-club', 'series-custom', 'series-gone'])

    expect(series).toStrictEqual([
      {
        id: 'series-club',
        version: 'series-change-1',
        cancelled: false,
        recurrence: weeklyOnThursday,
        recurrenceTimeZone: BERLIN,
        summary: 'Every week on Thursday',
        cancelledDates: ['2026-11-26', '2026-12-10'],
      },
      {
        id: 'series-custom',
        version: 'series-change-1',
        cancelled: false,
        recurrence: { ...weeklyOnThursday, range: { type: 'noEnd', startDate: '2023-03-02' } },
        summary: 'Every week on Thursday',
        cancelledDates: [],
      },
    ])
    const [requests = []] = graph.batches()
    expect(requests[0]?.url.searchParams.get('$select')).toContain('cancelledOccurrences')
    expect(requests[0]?.headers.Prefer).toBe(IMMUTABLE_IDS)
  })

  it('copies a series from its next occurrence, at its local time in its zone', async () => {
    expect.hasAssertions()
    const graph = fakeGraph(request => {
      const zoned = request.headers.Prefer?.includes('outlook.timezone')
      if (!zoned) {
        return { status: httpStatus.ok, body: graphMaster() }
      }
      if (request.url.pathname.endsWith('/instances')) {
        return {
          status: httpStatus.ok,
          body: {
            value: [
              {
                start: { dateTime: '2026-11-26T18:00:00.0000000', timeZone: BERLIN },
                end: { dateTime: '2026-11-26T19:00:00.0000000', timeZone: BERLIN },
              },
              {
                start: { dateTime: '2026-11-19T18:00:00.0000000', timeZone: BERLIN },
                end: { dateTime: '2026-11-19T19:00:00.0000000', timeZone: BERLIN },
              },
            ],
          },
        }
      }
      return {
        status: httpStatus.ok,
        body: {
          start: { dateTime: '2023-03-02T18:00:00.0000000', timeZone: BERLIN },
          end: { dateTime: '2023-03-02T19:00:00.0000000', timeZone: BERLIN },
        },
      }
    })

    const [series] = await provider(graph)
      .reader(connection(), 'calendar-club')
      .getSeriesContent(['series-club'])

    expect(series?.content).toStrictEqual({
      subject: 'Club meeting',
      body: { contentType: 'html', content: '<p>Bring a laptop.</p>' },
      start: { dateTime: '2026-11-19T18:00:00.0000000', timeZone: BERLIN },
      end: { dateTime: '2026-11-19T19:00:00.0000000', timeZone: BERLIN },
      isAllDay: false,
      location: 'Room 4.12',
      recurrence: {
        ...weeklyOnThursday,
        range: { ...weeklyOnThursday.range, startDate: '2026-11-19' },
      },
    })
    const [, zoned = []] = graph.batches()
    expect(zoned.map(request => [request.url.pathname, request.headers.Prefer])).toStrictEqual([
      [
        '/v1.0/me/calendars/calendar-club/events/series-club',
        `${IMMUTABLE_IDS}, outlook.timezone="${BERLIN}"`,
      ],
      [
        '/v1.0/me/calendars/calendar-club/events/series-club/instances',
        `${IMMUTABLE_IDS}, outlook.timezone="${BERLIN}"`,
      ],
    ])
    expect(Object.fromEntries(zoned[1]?.url.searchParams ?? [])).toMatchObject({
      startDateTime: NOW.toISOString(),
      endDateTime: new Date(
        NOW.getTime() + calendarTime.NEXT_OCCURRENCE_DAYS * MILLISECONDS_PER_DAY,
      ).toISOString(),
    })
  })

  it('keeps the original start and pattern of a series without a next occurrence', async () => {
    expect.hasAssertions()
    const ended = {
      ...weeklyOnThursday,
      range: { type: 'endDate', startDate: '2023-03-02', endDate: '2023-06-01' },
    }
    const graph = fakeGraph(request => {
      const zoned = request.headers.Prefer?.includes('outlook.timezone')
      if (!zoned) {
        return {
          status: httpStatus.ok,
          body: graphMaster({ recurrence: ended, originalStartTimeZone: 'Customized Time Zone' }),
        }
      }
      if (request.url.pathname.endsWith('/instances')) {
        return { status: httpStatus.ok, body: { value: [] } }
      }
      return {
        status: httpStatus.ok,
        body: {
          start: { dateTime: '2023-03-02T17:00:00.0000000', timeZone: 'UTC' },
          end: { dateTime: '2023-03-02T18:00:00.0000000', timeZone: 'UTC' },
        },
      }
    })

    const [series] = await provider(graph)
      .reader(connection(), 'calendar-club')
      .getSeriesContent(['series-club'])

    expect(series?.content).toMatchObject({
      start: { dateTime: '2023-03-02T17:00:00.0000000', timeZone: 'UTC' },
      recurrence: ended,
    })
    // A custom zone falls back to UTC
    expect(graph.batches()[1]?.[0]?.headers.Prefer).toBe(`${IMMUTABLE_IDS}, outlook.timezone="UTC"`)
  })

  it('fails to copy a series when its next occurrence cannot be read', async () => {
    expect.hasAssertions()
    const graph = fakeGraph(request => {
      if (!request.headers.Prefer?.includes('outlook.timezone')) {
        return { status: httpStatus.ok, body: graphMaster() }
      }
      return request.url.pathname.endsWith('/instances')
        ? { status: httpStatus.serviceUnavailable }
        : { status: httpStatus.ok, body: graphMaster() }
    })

    await expect(
      provider(graph).reader(connection(), 'calendar-club').getSeriesContent(['series-club']),
    ).rejects.toMatchObject({ kind: 'unavailable' })
  })
})

describe('microsoft calendar provider: writing the main calendar', () => {
  const content: Calendar.EventContent = {
    subject: 'Build night',
    body: { contentType: 'html', content: '<p>Pizza</p>' },
    start: { dateTime: '2026-11-19T17:00:00', timeZone: 'UTC' },
    end: { dateTime: '2026-11-19T19:00:00', timeZone: 'UTC' },
    isAllDay: false,
    location: 'Lab 2',
  }

  it('creates a copy in the default calendar, without attendees, once per transaction, and reads it back', async () => {
    expect.hasAssertions()
    const graph = fakeGraph(() => ({
      status: httpStatus.created,
      body: graphEvent({
        id: 'copy-1',
        iCalUId: 'copy-1-ical',
        changeKey: 'copy-change-1',
        webLink: 'https://outlook/copy-1',
        originalStartTimeZone: 'UTC',
      }),
    }))

    const copy = await provider(graph).createEvent(connection(), content, 'decision-1')

    expect(copy).toStrictEqual({
      id: 'copy-1',
      version: 'copy-change-1',
      event: {
        id: 'copy-1',
        iCalUId: 'copy-1-ical',
        title: 'Build night',
        start: '2026-11-19T17:00:00Z',
        end: '2026-11-19T19:00:00Z',
        allDay: false,
        location: 'Lab 2',
        cancelled: false,
        private: false,
        exception: false,
        version: 'copy-change-1',
        webLink: 'https://outlook/copy-1',
        originalTimeZone: 'UTC',
      },
    })
    const [call] = graph.calls
    expect([call?.method, call?.url.pathname]).toStrictEqual(['POST', '/v1.0/me/calendar/events'])
    expect(call?.body).toStrictEqual({
      subject: 'Build night',
      body: { contentType: 'html', content: '<p>Pizza</p>' },
      start: { dateTime: '2026-11-19T17:00:00', timeZone: 'UTC' },
      end: { dateTime: '2026-11-19T19:00:00', timeZone: 'UTC' },
      isAllDay: false,
      location: { displayName: 'Lab 2' },
      transactionId: 'decision-1',
      showAs: 'busy',
    })
    expect(call?.headers.Prefer).toBe(IMMUTABLE_IDS)
  })

  it('passes the pattern of a series copy on as it is, and does not read local times as UTC', async () => {
    expect.hasAssertions()
    const graph = fakeGraph(() => ({
      status: httpStatus.created,
      body: graphMaster({
        id: 'copy-2',
        changeKey: undefined,
        start: { dateTime: '2026-11-19T18:00:00.0000000', timeZone: BERLIN },
      }),
    }))

    const copy = await provider(graph).createEvent(
      connection(),
      { ...content, recurrence: weeklyOnThursday },
      'decision-2',
    )

    // The database has no `undefined`
    // eslint-disable-next-line unicorn/no-null
    expect(copy).toStrictEqual({ id: 'copy-2', version: null })
    expect(graph.calls[0]?.body).toMatchObject({ recurrence: weeklyOnThursday })
  })

  it('fails when Graph creates an event without an id', async () => {
    expect.hasAssertions()
    const graph = fakeGraph(() => ({ status: httpStatus.created, body: {} }))

    await expect(
      provider(graph).createEvent(connection(), content, 'decision-3'),
    ).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('updates a copy in place and returns its new version', async () => {
    expect.hasAssertions()
    const graph = fakeGraph(() => ({
      status: httpStatus.ok,
      body: { id: 'copy-1', changeKey: 'copy-change-2' },
    }))

    const updated = await provider(graph).updateEvent(connection(), 'copy/1', {
      start: content.start,
      end: content.end,
    })

    expect(updated).toStrictEqual({ version: 'copy-change-2' })
    const [call] = graph.calls
    expect([call?.method, call?.url.pathname]).toStrictEqual(['PATCH', '/v1.0/me/events/copy%2F1'])
    expect(call?.body).toStrictEqual({ start: content.start, end: content.end })
  })

  it.each([
    ['a 204', httpStatus.noContent],
    ['a 404, as the copy is gone already', httpStatus.notFound],
  ])('deletes a copy, taking %s as done', async (_, status) => {
    expect.hasAssertions()
    const graph = fakeGraph(() => ({ status }))

    await expect(provider(graph).deleteEvent(connection(), 'copy-1')).resolves.toBeUndefined()
    expect([graph.calls[0]?.method, graph.calls[0]?.url.pathname]).toStrictEqual([
      'DELETE',
      '/v1.0/me/events/copy-1',
    ])
  })

  it.each([
    [httpStatus.forbidden, 'consent'],
    [httpStatus.internalServerError, 'unavailable'],
  ])('fails to delete a copy on %i', async (status, kind) => {
    expect.hasAssertions()
    const graph = fakeGraph(() => ({ status }))

    await expect(provider(graph).deleteEvent(connection(), 'copy-1')).rejects.toMatchObject({
      kind,
    })
  })

  it('finds the occurrence of a series copy whose local start is on the date', async () => {
    expect.hasAssertions()
    const graph = fakeGraph(() => ({
      status: httpStatus.ok,
      body: {
        value: [
          {
            id: 'occurrence-25',
            start: { dateTime: '2026-11-25T23:30:00.0000000', timeZone: BERLIN },
          },
          {
            id: 'occurrence-26',
            start: { dateTime: '2026-11-26T18:00:00.0000000', timeZone: BERLIN },
          },
          {
            id: 'occurrence-27',
            start: { dateTime: '2026-11-27T18:00:00.0000000', timeZone: BERLIN },
          },
        ],
      },
    }))
    const calendars = provider(graph)

    const found = await calendars.findOccurrence(connection(), {
      seriesId: 'copy-1',
      date: '2026-11-26',
      timeZone: BERLIN,
    })
    const missing = await calendars.findOccurrence(connection(), {
      seriesId: 'copy-1',
      date: '2026-11-30',
      timeZone: BERLIN,
    })

    expect({ found, missing }).toStrictEqual({ found: 'occurrence-26', missing: undefined })
    const [call] = graph.calls
    expect(call?.url.pathname).toBe('/v1.0/me/events/copy-1/instances')
    expect(Object.fromEntries(call?.url.searchParams ?? [])).toMatchObject({
      startDateTime: '2026-11-25T00:00:00.000Z',
      endDateTime: '2026-11-28T00:00:00.000Z',
    })
    expect(call?.headers.Prefer).toBe(`${IMMUTABLE_IDS}, outlook.timezone="${BERLIN}"`)
  })
})

describe('microsoft calendar provider: errors', () => {
  it('refreshes the token once when Graph refuses it', async () => {
    expect.hasAssertions()
    const statuses = [httpStatus.unauthorized]
    const graph = fakeGraph(() => ({ status: httpStatus.ok, body: { value: [] } }), {
      status: () => statuses.shift(),
    })
    const mara = connection()

    await expect(provider(graph).listCalendars(mara)).resolves.toStrictEqual([])
    expect(mara.accessToken).toHaveBeenLastCalledWith({ force: true })
    expect(graph.calls.map(call => call.headers.Authorization)).toStrictEqual([
      'Bearer stored-token',
      'Bearer refreshed-token',
    ])
  })

  it('asks to sign in again when Graph refuses the refreshed token too', async () => {
    expect.hasAssertions()
    const graph = fakeGraph(() => ({ status: httpStatus.ok }), {
      status: () => httpStatus.unauthorized,
    })

    await expect(provider(graph).listCalendars(connection())).rejects.toMatchObject({
      kind: 'reconnect',
    })
  })

  it.each([
    [httpStatus.forbidden, 'consent'],
    [httpStatus.serviceUnavailable, 'unavailable'],
    [httpStatus.tooManyRequests, 'unavailable'],
  ])('reports %i as %s', async (status, kind) => {
    expect.hasAssertions()
    const graph = fakeGraph(() => ({ status: httpStatus.ok }), { status: () => status })
    const calendars = provider(graph)

    await expect(calendars.listCalendars(connection())).rejects.toMatchObject({ kind })
    await expect(
      calendars.updateEvent(connection(), 'copy-1', { subject: 'Changed' }),
    ).rejects.toMatchObject({ kind })
  })
})
