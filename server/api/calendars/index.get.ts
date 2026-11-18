import calendarApi from '../../calendar/api'
import calendarHttp from '../../utils/calendar'

/** The calendars of the user's account, for the picker: the main one, and which others are sources. */
export default defineEventHandler(event => calendarHttp.respond(event, calendarApi.calendars))
