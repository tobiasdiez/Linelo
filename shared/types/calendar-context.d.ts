import type createDatabase from '../../server/db/client'

/*
 * `Calendar.Context`, apart from the other calendar types because it names the server's
 * database: an import makes this file a module, which adds to the global namespace.
 */
declare global {
  namespace Calendar {
    /** What the calendar modules work with for a request: the user's database and accounts, and now. */
    interface Context {
      db: ReturnType<typeof createDatabase>['db']
      /** The user's accounts with a calendar adapter, oldest first. */
      accounts: readonly Account[]
      /** The first of them: its default calendar is the main calendar, where copies go (`readers.mainAccount`). */
      main: Account
      now: Date
    }
  }
}
