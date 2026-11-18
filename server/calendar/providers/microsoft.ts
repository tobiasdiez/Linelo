import type {
  Calendar as GraphCalendar,
  Event as GraphEvent,
} from '@microsoft/microsoft-graph-types'
import MailError from '../../mail/mail-error'
import calendarTime from '#shared/utils/calendar-time'
import graphClient from '../../microsoft/graph-client'
import httpStatus from '#shared/utils/http-status'
import isGone from '#shared/utils/is-gone'
import isRecord from '#shared/utils/is-record'
import microsoftEvents from './microsoft-events'
import providerAuth from '../../mail/provider-auth'

/*
 * Microsoft Graph adapter for calendars, on the Graph client shared with the mail adapter.
 * Listings are read in UTC; series copies in their recurrence zone.
 */

/** Event ids that survive moves between calendars. */
const IMMUTABLE_IDS = 'IdType="ImmutableId"'
const PAGE_SIZE = 100
/** A listing follows at most this many pages per calendar (500 events). */
const MAX_PAGES = 5
const EVENT_FIELDS: readonly (keyof GraphEvent)[] = [
  'id',
  'seriesMasterId',
  'iCalUId',
  'subject',
  'start',
  'end',
  'isAllDay',
  'location',
  'isCancelled',
  'sensitivity',
  'type',
  'changeKey',
  'webLink',
  'originalStartTimeZone',
]
const DETAIL_FIELDS: readonly (keyof GraphEvent)[] = [...EVENT_FIELDS, 'body']
const SERIES_FIELDS: readonly (keyof GraphEvent)[] = [
  'id',
  'changeKey',
  'isCancelled',
  'subject',
  'body',
  'location',
  'isAllDay',
  'start',
  'end',
  'recurrence',
  'cancelledOccurrences',
  'originalStartTimeZone',
]
const CALENDAR_FIELDS: readonly (keyof GraphCalendar)[] = ['id', 'name', 'isDefaultCalendar']

type Dependencies = ({ graph: Graph.Client } | { fetch: typeof fetch; timeoutMs?: number }) & {
  /** The clock, for the next occurrence of a series. */
  now?: () => Date
}

/** A calendar view waiting to be sent with the others of the same tick, in one batch. */
interface PendingView {
  calendarPath: string
  range: Calendar.Range
  resolve: (events: Calendar.Event[]) => void
  reject: (error: unknown) => void
}

const { query, assertAuthorized } = graphClient

/** Graph's own shape for a calendar; every property is optional, as Graph only sends what `$select` asked for. */
function isGraphCalendar(value: unknown): value is GraphCalendar {
  return isRecord(value)
}

/** The error for a failed call: a 403 means the account did not grant calendar access (or lost it). */
function failure(status: number | undefined, what: string): Error {
  return status === httpStatus.forbidden
    ? new MailError('consent', `Microsoft Graph refused to ${what} (403)`)
    : new MailError('unavailable', `Microsoft Graph could not ${what} (${status})`)
}

/** Throws for a failed response inside a batch: 401 to refresh the token, 403 as consent, else unavailable. */
function checked(response: Graph.BatchResponse | undefined, what: string): Graph.BatchResponse {
  assertAuthorized(response)
  if (!response || !httpStatus.isSuccess(response.status)) {
    throw failure(response?.status, what)
  }
  return response
}

function calendarPath(calendarId: string): string {
  return `/me/calendars/${encodeURIComponent(calendarId)}`
}

function eventPath(base: string, eventId: string): string {
  return `${base}/events/${encodeURIComponent(eventId)}`
}

function viewUrl({
  calendarPath: base,
  range,
}: Pick<PendingView, 'calendarPath' | 'range'>): string {
  return `${base}/calendarView?${query({
    startDateTime: range.from,
    endDateTime: range.to,
    $select: EVENT_FIELDS.join(','),
    $orderby: 'start/dateTime',
    $top: String(PAGE_SIZE),
  })}`
}

function getRequest(id: string, url: string, prefer = IMMUTABLE_IDS): Graph.BatchRequest {
  return { id, method: 'GET', url, headers: { Prefer: prefer } }
}

function inZone(zone: string): string {
  return `${IMMUTABLE_IDS}, outlook.timezone="${zone}"`
}

/** The body Graph gets for a copy: a personal appointment, no attendees, busy, Outlook's default reminder. */
function graphContent(content: Partial<Calendar.EventContent>): Record<string, unknown> {
  const { location, ...rest } = content
  return {
    ...rest,
    ...(location === undefined ? {} : { location: { displayName: location } }),
  }
}

/** Calls with the account's token, refreshed once when Graph refuses it. */
function withCaller<Result>(
  connection: Mail.Connection,
  call: (caller: Graph.Caller) => Promise<Result>,
): Promise<Result> {
  return providerAuth.withToken(connection, token =>
    call({ accountId: connection.account.id, token }),
  )
}

/** Creates the Microsoft Graph calendar provider. */
function createMicrosoftCalendarProvider(dependencies: Dependencies): Calendar.Provider {
  const graph = 'graph' in dependencies ? dependencies.graph : graphClient.create(dependencies)
  const now = dependencies.now ?? (() => new Date())
  /** Views asked for in the current tick, per account: sent together in one batch. */
  const pendingViews = new Map<string, { connection: Mail.Connection; views: PendingView[] }>()

  /** The events of a view response, with its further pages. */
  async function viewEntries(
    caller: Graph.Caller,
    response: Graph.BatchResponse | undefined,
  ): Promise<unknown[]> {
    const { body } = checked(response, 'read a calendar')
    const entries = graphClient.values(body)
    const next = graphClient.nextPage(body)
    if (next) {
      entries.push(
        ...(await graph.list(caller, next, {
          headers: { Prefer: IMMUTABLE_IDS },
          failure: status => failure(status, 'read a calendar'),
          maxPages: MAX_PAGES - 1,
        })),
      )
    }
    return entries
  }

  /** Sends the views of one account in one batch; each view resolves or fails on its own. */
  async function sendViews(
    connection: Mail.Connection,
    views: readonly PendingView[],
  ): Promise<void> {
    const requests = views.map((entry, index) => getRequest(`view-${index}`, viewUrl(entry)))
    try {
      const outcomes = await withCaller(connection, async caller => {
        const responses = await graph.batch(caller, requests)
        // A refused token inside the batch refreshes it and sends the whole batch again
        for (const { id } of requests) {
          assertAuthorized(responses.get(id))
        }
        return Promise.all(
          requests.map(({ id }) =>
            viewEntries(caller, responses.get(id)).then(
              entries => ({ entries }),
              (error: unknown) => {
                if (error instanceof providerAuth.UnauthorizedError) {
                  throw error
                }
                return { error }
              },
            ),
          ),
        )
      })
      for (const [index, pending] of views.entries()) {
        const outcome = outcomes[index]
        if (outcome && 'entries' in outcome) {
          pending.resolve(microsoftEvents.parseEvents(outcome.entries))
        } else {
          pending.reject(outcome?.error)
        }
      }
    } catch (error) {
      for (const pending of views) {
        pending.reject(error)
      }
    }
  }

  /**
   * The events of a calendar in the range. Views asked for in the same tick go out
   * together, one batch per account: the main calendar and every source of the week at once.
   */
  function readView(
    connection: Mail.Connection,
    path: string,
    range: Calendar.Range,
  ): Promise<Calendar.Event[]> {
    return new Promise((resolve, reject) => {
      const accountId = connection.account.id
      let pending = pendingViews.get(accountId)
      if (!pending) {
        const created = { connection, views: [] }
        pending = created
        pendingViews.set(accountId, created)
        queueMicrotask(() => {
          pendingViews.delete(accountId)
          void sendViews(created.connection, created.views)
        })
      }
      pending.views.push({ calendarPath: path, range, resolve, reject })
    })
  }

  /** Reads events by id in one batch; a 404 is `gone`. */
  async function eventsById<Parsed>(
    connection: Mail.Connection,
    urls: readonly { id: string; url: string }[],
    parse: (body: unknown) => Parsed | undefined,
  ): Promise<(Parsed | Calendar.Gone)[]> {
    if (urls.length === 0) {
      return []
    }
    const requests = urls.map(({ url }, index) => getRequest(`event-${index}`, url))
    return withCaller(connection, async caller => {
      const responses = await graph.batch(caller, requests)
      const found: (Parsed | Calendar.Gone)[] = []
      for (const [index, { id }] of urls.entries()) {
        const response = responses.get(`event-${index}`)
        if (response?.status === httpStatus.notFound) {
          found.push({ id, gone: true })
          continue
        }
        const parsed = parse(checked(response, 'read an event').body)
        if (parsed !== undefined) {
          found.push(parsed)
        }
      }
      return found
    })
  }

  async function seriesMasters(
    connection: Mail.Connection,
    base: string,
    ids: readonly string[],
  ): Promise<GraphEvent[]> {
    const masters = await eventsById(
      connection,
      ids.map(id => ({ id, url: `${eventPath(base, id)}?$select=${SERIES_FIELDS.join(',')}` })),
      body => (microsoftEvents.isGraphEvent(body) && body.id ? body : undefined),
    )
    return masters.filter(entry => !isGone(entry))
  }

  /** Per series: its own start and end, and its next occurrences, both in the series' zone. */
  async function zonedTimings(
    connection: Mail.Connection,
    base: string,
    series: readonly Calendar.Series[],
  ): Promise<Map<string, { master: unknown; next: GraphEvent | undefined }>> {
    const from = now()
    const until = new Date(
      from.getTime() + calendarTime.NEXT_OCCURRENCE_DAYS * calendarTime.MILLISECONDS_PER_DAY,
    )
    const requests = series.flatMap((entry, index) => {
      const prefer = inZone(entry.recurrenceTimeZone ?? 'UTC')
      const path = eventPath(base, entry.id)
      return [
        getRequest(`master-${index}`, `${path}?$select=start,end`, prefer),
        getRequest(
          `next-${index}`,
          `${path}/instances?${query({
            startDateTime: from.toISOString(),
            endDateTime: until.toISOString(),
            $select: 'start,end',
          })}`,
          prefer,
        ),
      ]
    })
    return withCaller(connection, async caller => {
      const responses = await graph.batch(caller, requests)
      return new Map(
        series.map((entry, index) => {
          const master = checked(responses.get(`master-${index}`), 'read a series').body
          // Failing here rather than copying the series from its first occurrence years ago
          const instances = checked(responses.get(`next-${index}`), 'find the next occurrence')
          const next = microsoftEvents.firstOccurrence(graphClient.values(instances.body))
          return [entry.id, { master, next }]
        }),
      )
    })
  }

  function reader(connection: Mail.Connection, calendarId: string): Calendar.SourceReader {
    const base = calendarPath(calendarId)

    async function getSeries(ids: readonly string[]): Promise<Calendar.Series[]> {
      const masters = await seriesMasters(connection, base, ids)
      return masters
        .map(master => microsoftEvents.parseSeries(master))
        .filter(entry => entry !== undefined)
    }

    return {
      listEvents: range => readView(connection, base, range),
      getSeries,
      async getSeriesContent(ids) {
        const masters = await seriesMasters(connection, base, ids)
        const series = masters.flatMap(master => {
          const parsed = microsoftEvents.parseSeries(master)
          return parsed ? [{ parsed, master }] : []
        })
        if (series.length === 0) {
          return []
        }
        const timings = await zonedTimings(
          connection,
          base,
          series.map(({ parsed }) => parsed),
        )
        return series.flatMap(({ parsed, master }) => {
          const timing = timings.get(parsed.id)
          const content =
            timing && microsoftEvents.seriesContent(master, timing.master, timing.next)
          return content ? [{ ...parsed, content }] : []
        })
      },
      getEvents: ids =>
        eventsById(
          connection,
          ids.map(id => ({ id, url: `${eventPath(base, id)}?$select=${DETAIL_FIELDS.join(',')}` })),
          body => microsoftEvents.parseDetailed(body),
        ),
    }
  }

  async function listCalendars(connection: Mail.Connection): Promise<Calendar.ProviderCalendar[]> {
    const entries = await withCaller(connection, caller =>
      graph.list(caller, `/me/calendars?$select=${CALENDAR_FIELDS.join(',')}`, {
        headers: { Prefer: IMMUTABLE_IDS },
        failure: status => failure(status, 'list the calendars'),
        maxPages: MAX_PAGES,
      }),
    )
    return entries.flatMap(entry => {
      if (!isGraphCalendar(entry) || !entry.id) {
        return []
      }
      return [
        {
          externalId: entry.id,
          name: entry.name?.trim() || 'Calendar',
          isDefault: entry.isDefaultCalendar === true,
        },
      ]
    })
  }

  async function createEvent(
    connection: Mail.Connection,
    content: Calendar.EventContent,
    transactionId: string,
  ): Promise<{ id: string; version: string | null; event?: Calendar.Event }> {
    const body = await withCaller(connection, caller =>
      graph.request(caller, '/me/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Prefer': IMMUTABLE_IDS },
        // A copy is a personal appointment: no attendees, so nobody gets an invitation
        body: { ...graphContent(content), transactionId, showAs: 'busy' },
        failure: status => failure(status, 'create an event'),
      }),
    )
    if (!microsoftEvents.isGraphEvent(body) || !body.id) {
      throw new MailError('unavailable', 'Microsoft Graph created an event without an id')
    }
    // Graph answers the new event in the zones it was given: UTC for single events
    const event = microsoftEvents.parseEvent(body)
    // Graph and the database have no `undefined`
    // eslint-disable-next-line unicorn/no-null
    return { id: body.id, version: body.changeKey ?? null, ...(event ? { event } : {}) }
  }

  async function updateEvent(
    connection: Mail.Connection,
    eventId: string,
    content: Partial<Calendar.EventContent>,
  ): Promise<{ version: string | null }> {
    const body = await withCaller(connection, caller =>
      graph.request(caller, eventPath('/me', eventId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Prefer': IMMUTABLE_IDS },
        body: graphContent(content),
        failure: status => failure(status, 'update an event'),
      }),
    )
    const version = microsoftEvents.isGraphEvent(body) ? body.changeKey : undefined
    // Graph and the database have no `undefined`
    // eslint-disable-next-line unicorn/no-null
    return { version: version ?? null }
  }

  async function deleteEvent(connection: Mail.Connection, eventId: string): Promise<void> {
    const { status } = await withCaller(connection, caller =>
      graph.send(caller, eventPath('/me', eventId), {
        method: 'DELETE',
        headers: { Prefer: IMMUTABLE_IDS },
      }),
    )
    // Deleted already, for example in Outlook
    if (status !== httpStatus.notFound && !httpStatus.isSuccess(status)) {
      throw failure(status, 'delete an event')
    }
  }

  async function findOccurrence(
    connection: Mail.Connection,
    { seriesId, date, timeZone }: { seriesId: string; date: string; timeZone: string },
  ): Promise<string | undefined> {
    // A day either side in UTC, then the occurrence whose local start falls on the date
    const day = Date.parse(`${date}T00:00:00Z`)
    const entries = await withCaller(connection, caller =>
      graph.list(
        caller,
        `${eventPath('/me', seriesId)}/instances?${query({
          startDateTime: new Date(day - calendarTime.MILLISECONDS_PER_DAY).toISOString(),
          endDateTime: new Date(day + 2 * calendarTime.MILLISECONDS_PER_DAY).toISOString(),
          $select: 'id,start',
        })}`,
        {
          headers: { Prefer: inZone(timeZone) },
          failure: status => failure(status, 'find an occurrence'),
          maxPages: 1,
        },
      ),
    )
    const found = entries.find(
      entry =>
        isRecord(entry) &&
        isRecord(entry.start) &&
        typeof entry.start.dateTime === 'string' &&
        entry.start.dateTime.startsWith(date),
    )
    return isRecord(found) && typeof found.id === 'string' ? found.id : undefined
  }

  return {
    calendarScopes: ['Calendars.ReadWrite'],
    listCalendars,
    reader,
    listMainEvents: (connection, range) => readView(connection, '/me/calendar', range),
    async getMainEvents(connection, ids) {
      return eventsById(
        connection,
        ids.map(id => ({ id, url: `${eventPath('/me', id)}?$select=${EVENT_FIELDS.join(',')}` })),
        body => microsoftEvents.parseEvent(body),
      )
    },
    createEvent,
    updateEvent,
    deleteEvent,
    findOccurrence,
  }
}

export default createMicrosoftCalendarProvider
