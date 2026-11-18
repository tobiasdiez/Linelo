import calendarApi from '../../calendar/api'
import calendarHttp from '../../utils/calendar'

/** The main calendar's events in the range, with the suggestions of the user's other calendars. */
export default defineEventHandler(event =>
  calendarHttp.respond(event, calendarApi.week, { query: getQuery(event) }),
)
