import createDemoCalendarProvider from './demo'
import createMicrosoftCalendarProvider from './microsoft'
import graph from '../../microsoft/graph'

/** The demo calendars exist in development only (see `server/auth/demo-sign-in.ts`). */
const demo = import.meta.dev ? createDemoCalendarProvider() : undefined

/** The calendar adapters, keyed by the provider id of the accounts they serve. */
const calendarProviders = {
  // The Graph client of the mail adapter: one queue per mailbox for both
  microsoft: createMicrosoftCalendarProvider({ graph }),
  ...(demo ? { demo } : {}),
} satisfies Record<string, Calendar.Provider>

/** Forgets the demo calendars' copies, for a fresh demo sign-in. */
function resetDemo(): void {
  demo?.reset()
}

const calendar = { providers: calendarProviders, resetDemo }

export default calendar
