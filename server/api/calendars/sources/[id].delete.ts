import calendarApi from '../../../calendar/api'
import calendarHttp from '../../../utils/calendar'

/** Stops suggesting from a calendar. Its decisions stay, so adding it again offers nothing twice. */
export default defineEventHandler(event =>
  calendarHttp.respond(event, calendarApi.removeSource, { id: getRouterParam(event, 'id') }),
)
