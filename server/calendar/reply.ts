import type calendarApi from './api'
import httpStatus from '#shared/utils/http-status'

type Answer = Awaited<ReturnType<(typeof calendarApi)[keyof typeof calendarApi]>>

/** What h3 does with an answer of the calendar API: throw an error, send no content, or send a body. */
type Reply =
  | {
      kind: 'error'
      error: { statusCode: number; statusMessage: string; data?: { reason: string } }
    }
  | { kind: 'empty' }
  | { kind: 'body'; status: number; body: unknown }

/** Turns an answer into what h3 does with it; `server/utils/calendar.ts` does it. */
function replyOf(answer: Answer): Reply {
  if ('statusMessage' in answer) {
    const { status, statusMessage, data } = answer
    return {
      kind: 'error',
      error: { statusCode: status, statusMessage, ...(data ? { data } : {}) },
    }
  }
  return answer.status === httpStatus.noContent
    ? { kind: 'empty' }
    : { kind: 'body', status: answer.status, body: answer.body }
}

export default replyOf
