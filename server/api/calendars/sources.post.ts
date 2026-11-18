import calendarApi from '../../calendar/api'
import calendarHttp from '../../utils/calendar'

/** Makes one of the account's calendars a source of suggestions. */
export default defineEventHandler(event =>
  calendarHttp.respond(event, calendarApi.addSource, { withBody: true }),
)
