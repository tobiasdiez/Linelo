import calendarApi from '../../../calendar/api'
import calendarHttp from '../../../utils/calendar'

/** Undoes a decision: the copy is deleted, and the event is suggested again. */
export default defineEventHandler(event =>
  calendarHttp.respond(event, calendarApi.undo, { id: getRouterParam(event, 'id') }),
)
