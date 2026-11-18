import connections from '../mail/connections'
import readers from './readers'

interface Dependencies {
  db: Calendar.Context['db']
  /** Calendar adapters by provider id. */
  providers: Readonly<Record<string, Calendar.Provider>>
  tokens: Mail.TokenSource
}

/**
 * The calendar context of the user's request: their calendar accounts and the main one.
 * Without an account with a calendar, Linelo has no calendar access: `consent`.
 */
async function loadContext(
  { db, providers, tokens }: Dependencies,
  { userId, now }: { userId: string; now: Date },
): Promise<Calendar.Context> {
  const accounts = await connections.loadCalendarAccounts({ db, providers, tokens }, userId)
  return { db, accounts, main: readers.mainAccount(accounts), now }
}

export default loadContext
