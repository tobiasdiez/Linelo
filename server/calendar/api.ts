import MailError from '../mail/mail-error'
import calendarSync from './sync'
import decisions from './decisions'
import httpErrorOf from '../mail/http-error'
import httpStatus from '#shared/utils/http-status'
import isUuid from '#shared/utils/is-uuid'
import sources from './sources'
import week from './week'

/*
 * The calendar's HTTP API without the HTTP: each endpoint takes what the request carries
 * and answers a status with a body or a message. `server/utils/calendar.ts` puts it on h3;
 * tests call it directly.
 */

/** What a request carries, as the HTTP layer reads it. */
interface ApiRequest {
  /** The signed-in user; `undefined` when signed out. */
  userId: string | undefined
  /** The user's calendar context; throws `consent` when no account has a calendar. */
  context: (userId: string) => Promise<Calendar.Context>
  query?: unknown
  /** Reads the body: only once the user is known, so a signed-out request answers 401 whatever it sent. */
  readBody?: () => Promise<unknown>
  /** The `:id` of the path. */
  id?: string
}

/** What an endpoint parses: the request's parts, its body read. */
interface Input {
  query?: unknown
  body?: unknown
  id?: string
}

/** The HTTP answer: a success with its body, or an error with its message (and a `reason` for the app). */
type Answer =
  | { status: number; body: unknown }
  | { status: number; statusMessage: string; data?: { reason: Inbox.ApiErrorReason } }

type Endpoint = (request: ApiRequest) => Promise<Answer>

type Refusal = Extract<Calendar.Outcome, { refusal: string }>['refusal']
type Result = Extract<Calendar.Outcome, { result: string }>['result']

const RESULTS: Readonly<Record<Result, number>> = {
  ok: httpStatus.ok,
  created: httpStatus.created,
  done: httpStatus.noContent,
}
const REFUSALS: Readonly<Record<Refusal, number>> = {
  'invalid': httpStatus.badRequest,
  'not-found': httpStatus.notFound,
  'conflict': httpStatus.conflict,
}

/**
 * Answers a request: 401 when signed out, 400 when `parse` says what is wrong with the
 * input, the outcome of `run` otherwise; a failed provider call as `httpErrorOf` says
 * (401 reconnect, 403 consent, 503).
 */
async function answer<Parsed>(
  request: ApiRequest,
  parse: (input: Input) => Parsed | string,
  run: (
    context: Calendar.Context,
    userId: string,
    parsed: Parsed,
  ) => Promise<Calendar.Outcome<unknown>>,
): Promise<Answer> {
  const { userId, query, id } = request
  if (!userId) {
    return { status: httpStatus.unauthorized, statusMessage: 'Not signed in' }
  }
  const body = await request.readBody?.()
  const parsed = parse({ query, body, id })
  if (typeof parsed === 'string') {
    return { status: httpStatus.badRequest, statusMessage: parsed }
  }
  try {
    const outcome = await run(await request.context(userId), userId, parsed)
    return 'refusal' in outcome
      ? { status: REFUSALS[outcome.refusal], statusMessage: outcome.message }
      : { status: RESULTS[outcome.result], body: outcome.body }
  } catch (error) {
    if (!(error instanceof MailError)) {
      throw error
    }
    console.error('A calendar call failed', error)
    const { statusCode, statusMessage, data } = httpErrorOf(error)
    return { status: statusCode, statusMessage, ...(data ? { data } : {}) }
  }
}

function nothing(): undefined {
  return undefined
}

/** The path's id, which names a row: anything but a UUID names none. */
function rowId({ id }: ApiRequest): string | undefined {
  return isUuid(id) ? id : undefined
}

const calendarApi = {
  /** `GET /api/calendar/week?from=&to=` */
  week: request =>
    answer(
      request,
      ({ query }) => week.parseRange(query),
      (context, userId, range) => week.load(context, userId, range),
    ),
  /** `POST /api/calendar/sync` */
  sync: request =>
    answer(request, nothing, (context, userId) => calendarSync.sync(context, userId)),
  /** `POST /api/calendar/decisions` */
  decide: request =>
    answer(
      request,
      ({ body }) => decisions.parseRequest(body),
      (context, userId, decision) => decisions.decide(context, userId, decision),
    ),
  /** `DELETE /api/calendar/decisions/:id` */
  undo: request =>
    answer(request, nothing, (context, userId) => {
      const id = rowId(request)
      return id
        ? decisions.undo(context, userId, id)
        : Promise.resolve({ refusal: 'not-found' as const, message: 'No such decision' })
    }),
  /** `GET /api/calendars` */
  calendars: request =>
    answer(request, nothing, (context, userId) => sources.listAvailable(context, userId)),
  /** `POST /api/calendars/sources` */
  addSource: request =>
    answer(
      request,
      ({ body }) => sources.parseRequest(body),
      (context, userId, source) => sources.add(context, userId, source),
    ),
  /** `DELETE /api/calendars/sources/:id` */
  removeSource: request =>
    answer(request, nothing, (context, userId) => {
      const id = rowId(request)
      return id
        ? sources.remove(context, userId, id)
        : Promise.resolve({ refusal: 'not-found' as const, message: 'No such calendar source' })
    }),
} satisfies Record<string, Endpoint>

export default calendarApi
