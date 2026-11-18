import auth from './auth'
import calendar from '../calendar/providers'
import type calendarApi from '../calendar/api'
import createTokenSource from '../auth/token-source'
import db from './db'
import loadContext from '../calendar/context'
import replyOf from '../calendar/reply'

type Endpoint = (typeof calendarApi)[keyof typeof calendarApi]
type Event = Parameters<typeof getQuery>[0]

const tokens = createTokenSource(auth)

/**
 * Answers a request through an endpoint of the calendar API (`server/calendar/api.ts`):
 * the session, the user's context, the body (read only once the user is known; broken
 * JSON reads as nothing, which the endpoint answers with 400) and the h3 response.
 */
async function respond(
  event: Event,
  endpoint: Endpoint,
  { query, id, withBody = false }: { query?: unknown; id?: string; withBody?: boolean } = {},
): Promise<unknown> {
  const session = await auth.api.getSession({ headers: event.headers })
  const answer = await endpoint({
    userId: session?.user.id,
    context: userId =>
      loadContext({ db, providers: calendar.providers, tokens }, { userId, now: new Date() }),
    query,
    id,
    ...(withBody ? { readBody: () => readBody(event).catch(() => undefined) } : {}),
  })
  const reply = replyOf(answer)
  if (reply.kind === 'error') {
    throw createError(reply.error)
  }
  if (reply.kind === 'empty') {
    return sendNoContent(event)
  }
  setResponseStatus(event, reply.status)
  return reply.body
}

const calendarHttp = { respond }

export default calendarHttp
