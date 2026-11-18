import calendarApi from '../../calendar/api'
import calendarHttp from '../../utils/calendar'

/** Accepts a suggestion (a copy in the main calendar) or dismisses it. */
export default defineEventHandler(event =>
  calendarHttp.respond(event, calendarApi.decide, { withBody: true }),
)
