import calendarApi from '../../calendar/api'
import calendarHttp from '../../utils/calendar'

/** Brings the copies in the main calendar in step with their sources. */
export default defineEventHandler(event => calendarHttp.respond(event, calendarApi.sync))
