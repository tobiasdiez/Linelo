import { describe, expect, it, vi } from 'vite-plus/test'
import MailError from '#server/mail/mail-error'
import calendarApi from '#server/calendar/api'
import calendarFakes from './calendar-fakes'
import httpStatus from '#shared/utils/http-status'
import isRecord from '#shared/utils/is-record'

const { event } = calendarFakes
const NOW = new Date('2026-11-17T12:00:00Z')
const OK = httpStatus.ok
const WEEK = { from: '2026-11-15T23:00:00Z', to: '2026-11-22T23:00:00Z' }

/** Mara with Robotics Club as a source, and requests as the HTTP layer would make them. */
async function setupApi() {
  vi.spyOn(console, 'error').mockReturnValue()
  const setup = await calendarFakes.setup()
  const sourceId = await setup.addSource('calendar-robotics', { name: 'Robotics Club' })
  setup.fake.calendar('calendar-robotics').events.push(event({ id: 'build-night' }))
  function request({ query, body, id }: { query?: unknown; body?: unknown; id?: string } = {}) {
    return {
      userId: setup.userId,
      context: async () => setup.dependencies(NOW),
      query,
      id,
      readBody: async () => body,
    }
  }
  return { ...setup, sourceId, request }
}

/** The id in the body of an answer. */
function idOf(answer: Awaited<ReturnType<typeof calendarApi.week>>): string {
  const body = 'body' in answer ? answer.body : undefined
  return isRecord(body) && typeof body.id === 'string' ? body.id : ''
}

describe('calendar api', () => {
  it('answers 401 when signed out, before reading anything', async () => {
    expect.hasAssertions()
    const context = vi.fn<() => Promise<Calendar.Context>>()
    // Broken JSON would be a 400, but only for someone signed in
    const readBody = vi.fn<() => Promise<unknown>>(async () => {
      throw new Error('Invalid JSON')
    })

    const answers = await Promise.all(
      Object.entries(calendarApi).map(async ([name, endpoint]) => [
        name,
        await endpoint({ userId: undefined, context, readBody }),
      ]),
    )

    const signedOut = { status: 401, statusMessage: 'Not signed in' }
    expect(answers).toStrictEqual(Object.keys(calendarApi).map(name => [name, signedOut]))
    expect(context).not.toHaveBeenCalled()
    expect(readBody).not.toHaveBeenCalled()
  })

  it('answers 400 for a body that is not JSON', async () => {
    expect.hasAssertions()
    const { request } = await setupApi()

    const answer = await calendarApi.decide({ ...request(), readBody: async () => undefined })

    expect(answer).toStrictEqual({ status: 400, statusMessage: 'The body must be a JSON object' })
  })

  it('answers 400 with what is wrong with the input', async () => {
    expect.hasAssertions()
    const { request } = await setupApi()

    const answers = await Promise.all([
      calendarApi.week(request({ query: { from: WEEK.from, to: '2026-12-31T00:00:00Z' } })),
      calendarApi.decide(request({ body: { sourceId: 'x', eventId: 'e', decision: 'accept' } })),
      calendarApi.addSource(request({ body: { kind: 'ics', externalId: 'https://x/feed.ics' } })),
    ])

    expect(answers).toStrictEqual([
      {
        status: 400,
        statusMessage: 'from and to must be ISO instants, from before to, at most 8 days apart',
      },
      { status: 400, statusMessage: 'sourceId must be the id of one of your calendar sources' },
      { status: 400, statusMessage: 'Unknown calendar kind' },
    ])
  })

  it('answers 200 with the week, the sync report and the calendars', async () => {
    expect.hasAssertions()
    const { request } = await setupApi()

    const [week, sync, calendars] = await Promise.all([
      calendarApi.week(request({ query: WEEK })),
      calendarApi.sync(request()),
      calendarApi.calendars(request()),
    ])

    expect([week.status, sync.status, calendars.status]).toStrictEqual([OK, OK, OK])
    expect(week).toMatchObject({ body: { suggestions: [{ eventId: 'build-night' }] } })
    expect(sync).toStrictEqual({ status: 200, body: { updated: 0, removed: [], unreachable: [] } })
  })

  it('answers 201 for a decision, 409 for a second one, and 204 for its undo', async () => {
    expect.hasAssertions()
    const { request, sourceId } = await setupApi()
    const body = { sourceId, eventId: 'build-night', decision: 'accept' }

    const created = await calendarApi.decide(request({ body }))
    const again = await calendarApi.decide(request({ body }))
    const id = idOf(created)
    const undone = await calendarApi.undo(request({ id }))

    expect([created.status, again, undone]).toStrictEqual([
      httpStatus.created,
      { status: 409, statusMessage: 'Decided already' },
      { status: 204, body: undefined },
    ])
  })

  it('answers 404 for what is not the user’s or does not exist', async () => {
    expect.hasAssertions()
    const { request, sourceId } = await setupApi()

    const answers = await Promise.all([
      calendarApi.undo(request({ id: 'not-a-uuid' })),
      calendarApi.undo(request({ id: '6f1c0000-0000-4000-8000-000000000009' })),
      calendarApi.removeSource(request({ id: 'robotics' })),
      calendarApi.decide(
        request({
          body: {
            sourceId: '6f1c0000-0000-4000-8000-000000000009',
            eventId: 'e',
            decision: 'dismiss',
          },
        }),
      ),
      calendarApi.decide(request({ body: { sourceId, eventId: 'unknown', decision: 'dismiss' } })),
      calendarApi.addSource(request({ body: { kind: 'outlook', externalId: 'calendar-unknown' } })),
    ])

    expect(answers).toStrictEqual([
      { status: 404, statusMessage: 'No such decision' },
      { status: 404, statusMessage: 'No such decision' },
      { status: 404, statusMessage: 'No such calendar source' },
      { status: 404, statusMessage: 'No such calendar source' },
      { status: 404, statusMessage: 'No such event' },
      { status: 404, statusMessage: 'No such calendar' },
    ])
  })

  it('answers 201 for a new source and 204 for its removal', async () => {
    expect.hasAssertions()
    const { request, fake } = await setupApi()
    fake.addCalendar('calendar-choir')

    const added = await calendarApi.addSource(
      request({ body: { kind: 'outlook', externalId: 'calendar-choir' } }),
    )
    const id = idOf(added)
    const removed = await calendarApi.removeSource(request({ id }))

    expect(added).toStrictEqual({ status: 201, body: { id, name: 'calendar-choir' } })
    expect(removed).toStrictEqual({ status: 204, body: undefined })
  })

  it('answers 403 consent without calendar access, 401 reconnect, and 503 when Graph is down', async () => {
    expect.hasAssertions()
    const { request, fake } = await setupApi()

    const consent = await calendarApi.week({
      ...request({ query: WEEK }),
      context: () => Promise.reject(new MailError('consent', 'No account has a calendar')),
    })
    fake.provider.listMainEvents.mockRejectedValueOnce(new MailError('reconnect', 'Refused'))
    const reconnect = await calendarApi.week(request({ query: WEEK }))
    fake.provider.listCalendars.mockRejectedValueOnce(new MailError('unavailable', 'Down'))
    const unavailable = await calendarApi.calendars(request())

    expect([consent, reconnect, unavailable]).toStrictEqual([
      { status: 403, statusMessage: 'Permission missing', data: { reason: 'consent' } },
      { status: 401, statusMessage: 'Sign in again', data: { reason: 'reconnect' } },
      { status: 503, statusMessage: 'Provider unavailable' },
    ])
  })

  it('lets other failures through as they are', async () => {
    expect.hasAssertions()
    const { request } = await setupApi()

    await expect(
      calendarApi.week({
        ...request({ query: WEEK }),
        context: () => Promise.reject(new Error('Bug')),
      }),
    ).rejects.toThrow('Bug')
  })
})
