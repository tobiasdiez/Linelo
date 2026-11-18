import calendarBuilders from '~/data/calendar-builders'
import httpStatus from '#shared/utils/http-status'
import { registerEndpoint } from '@nuxt/test-utils/runtime'

type Answer<Body, Input = undefined> = (input: Input) => Body | Response | Promise<Body | Response>

interface FakeCalendarApi {
  /** Answers `GET /api/calendar/week`; by default the story week for its Monday, and an empty week otherwise. */
  week: { answer: Answer<Calendar.WeekResponse, Calendar.Range> }
  /** Answers `POST /api/calendar/sync`: nothing changed, unless replaced. */
  sync: { answer: Answer<Calendar.SyncResponse> }
  /** Answers `POST /api/calendar/decisions`: a new decision, with a copy for an accepted single event. */
  decide: { answer: Answer<Calendar.DecisionResponse, Calendar.DecisionRequest> }
  /** Answers `DELETE /api/calendar/decisions/:id`: 204 unless replaced. */
  undo: { answer: Answer<undefined, string> }
  /** Answers `GET /api/calendars`. */
  calendars: { answer: Answer<Calendar.CalendarsResponse> }
  /** Answers `POST /api/calendars/sources`. */
  addSource: { answer: Answer<Calendar.SourceResponse, Calendar.SourceRequest> }
  /** What the app asked for, in order. */
  requests: {
    weeks: Calendar.Range[]
    syncs: number
    decisions: Calendar.DecisionRequest[]
    undos: string[]
    sourcesAdded: Calendar.SourceRequest[]
    sourcesRemoved: string[]
  }
  /** Lets requests still in flight land, so they cannot reach the next test, then removes the fake. */
  restore: () => Promise<void>
}

/** The answer of the API when Linelo has no calendar access. */
function consentResponse(): Response {
  return Response.json(
    {
      statusCode: httpStatus.forbidden,
      statusMessage: 'Permission missing',
      data: { reason: 'consent' },
    },
    { status: httpStatus.forbidden },
  )
}

/** The answer of the API when Graph did not answer. */
function unavailableResponse(): Response {
  return new Response(undefined, { status: httpStatus.serviceUnavailable })
}

function emptyWeek(): Calendar.WeekResponse {
  return { events: [], suggestions: [], moreLater: false, unreachable: [], sourceCount: 3 }
}

function nextTask(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, 0)
  })
}

async function json<Body>(event: { web?: { request?: Request } }): Promise<Body> {
  // The fake only reads what the app sent; the app's types say what that is
  // eslint-disable-next-line typescript/no-unsafe-type-assertion
  return (await event.web?.request?.json()) as Body
}

/** Stands in for the calendar API, recording what the app sent. */
function fakeCalendarApi(): FakeCalendarApi {
  const inFlight = new Set<Promise<unknown>>()
  const unregister: (() => void)[] = []
  const requests: FakeCalendarApi['requests'] = {
    weeks: [],
    syncs: 0,
    decisions: [],
    undos: [],
    sourcesAdded: [],
    sourcesRemoved: [],
  }
  let decisionCount = 0
  /** The suggestions the fake answered with, so a decision can name its copy. */
  const offered = new Map<string, Calendar.Suggestion>()

  const api: Omit<FakeCalendarApi, 'requests' | 'restore'> = {
    week: {
      answer: ({ from }) => {
        const range = calendarBuilders.instantsOf(calendarBuilders.monday)
        return from === range.from ? calendarBuilders.storyWeek() : emptyWeek()
      },
    },
    sync: { answer: () => ({ updated: 0, removed: [], unreachable: [] }) },
    decide: {
      answer: request => {
        decisionCount += 1
        const suggestion = offered.get(`${request.sourceId}:${request.eventId}`)
        const event =
          request.decision === 'accept' && suggestion && !suggestion.series
            ? calendarBuilders.copyOf(suggestion)
            : undefined
        return {
          id: `decision-${decisionCount}`,
          decision: request.decision === 'accept' ? 'accepted' : 'dismissed',
          ...(event ? { event } : {}),
        }
      },
    },
    undo: { answer: () => new Response(undefined, { status: httpStatus.noContent }) },
    calendars: { answer: () => calendarBuilders.calendarsListing() },
    addSource: {
      answer: request => ({ id: `source-${request.externalId}`, name: request.externalId }),
    },
  }

  /** Answers through `answer`, tracking the request until it landed. */
  function track<Body>(answering: Promise<Body | Response>): Promise<Body | Response> {
    inFlight.add(answering)
    return answering
  }

  function registerUndo(id: string): void {
    unregister.push(
      registerEndpoint(`/api/calendar/decisions/${id}`, {
        method: 'DELETE',
        handler: async () => {
          requests.undos.push(id)
          const answer = await track(Promise.resolve(api.undo.answer(id)))
          return answer ?? new Response(undefined, { status: httpStatus.noContent })
        },
      }),
    )
  }

  function registerRemoval(id: string): void {
    unregister.push(
      registerEndpoint(`/api/calendars/sources/${id}`, {
        method: 'DELETE',
        handler: () => {
          requests.sourcesRemoved.push(id)
          return new Response(undefined, { status: httpStatus.noContent })
        },
      }),
    )
  }

  for (const calendar of calendarBuilders.calendarsListing().calendars) {
    if (calendar.sourceId) {
      registerRemoval(calendar.sourceId)
    }
  }

  unregister.push(
    registerEndpoint('/api/calendar/week', async event => {
      const query = new URL(event.path, 'http://localhost').searchParams
      const range = { from: query.get('from') ?? '', to: query.get('to') ?? '' }
      requests.weeks.push(range)
      const answer = await track(Promise.resolve(api.week.answer(range)))
      if (!(answer instanceof Response)) {
        for (const suggestion of answer.suggestions) {
          offered.set(suggestion.key, suggestion)
        }
      }
      return answer
    }),
    registerEndpoint('/api/calendar/sync', {
      method: 'POST',
      handler: async () => {
        requests.syncs += 1
        return track(Promise.resolve(api.sync.answer(undefined)))
      },
    }),
    registerEndpoint('/api/calendar/decisions', {
      method: 'POST',
      handler: async event => {
        const request = await json<Calendar.DecisionRequest>(event)
        requests.decisions.push(request)
        const answer = await track(Promise.resolve(api.decide.answer(request)))
        if (answer instanceof Response) {
          return answer
        }
        registerUndo(answer.id)
        return answer
      },
    }),
    registerEndpoint('/api/calendars', async () =>
      track(Promise.resolve(api.calendars.answer(undefined))),
    ),
    registerEndpoint('/api/calendars/sources', {
      method: 'POST',
      handler: async event => {
        const request = await json<Calendar.SourceRequest>(event)
        requests.sourcesAdded.push(request)
        const answer = await track(Promise.resolve(api.addSource.answer(request)))
        if (!(answer instanceof Response)) {
          registerRemoval(answer.id)
        }
        return answer
      },
    }),
  )

  return {
    ...api,
    requests,
    restore: async () => {
      await Promise.allSettled(inFlight)
      // Two more tasks, for the app to take in the answers and act on them
      await nextTask()
      await nextTask()
      for (const remove of unregister) {
        remove()
      }
    },
  }
}

const fakeCalendar = { api: fakeCalendarApi, consentResponse, unavailableResponse, emptyWeek }

export default fakeCalendar
