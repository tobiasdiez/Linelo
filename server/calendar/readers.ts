import MailError from '../mail/mail-error'
import type { calendarSources } from '../db/schema'
import uniqueById from '#shared/utils/unique-by-id'

/** What a reader needs to know about a source row. */
type Source = Pick<
  typeof calendarSources.$inferSelect,
  'kind' | 'accountId' | 'externalId' | 'name'
>

/** A reader for a source that cannot be read: every call fails, so the source counts as unreachable. */
function unreadable(source: Source, why: string): Calendar.SourceReader {
  function fail(): Promise<never> {
    return Promise.reject(new MailError('unavailable', `${source.name} cannot be read: ${why}`))
  }
  return { listEvents: fail, getSeries: fail, getSeriesContent: fail, getEvents: fail }
}

/** The account whose default calendar is the main calendar: the oldest one with a calendar adapter. */
function mainAccount(accounts: readonly Calendar.Account[]): Calendar.Account {
  const [account] = accounts
  if (!account) {
    throw new MailError('consent', 'No connected account has a calendar')
  }
  return account
}

/** The account that reads the source, if it is still connected. */
function accountFor(
  source: Pick<Source, 'accountId'>,
  accounts: readonly Calendar.Account[],
): Calendar.Account | undefined {
  return accounts.find(({ connection }) => connection.account.id === source.accountId)
}

/**
 * The reader of a source, by its `kind`. Only `outlook` exists this round: a calendar
 * in the account's own calendar list, read by the account's provider. Group calendars
 * and ICS feeds plug in here as further kinds; `suggestions.ts`, `sync.ts` and
 * `decisions.ts` stay as they are.
 */
function readerFor(source: Source, accounts: readonly Calendar.Account[]): Calendar.SourceReader {
  if (source.kind !== 'outlook') {
    return unreadable(source, `no reader for kind ${source.kind}`)
  }
  const account = accountFor(source, accounts)
  return account
    ? account.provider.reader(account.connection, source.externalId)
    : unreadable(source, 'its account is not connected')
}

/**
 * Reads the sources' events in the ranges, all in one tick so each account sends one
 * batch. A source that fails is named in `unreachable`, the others are unaffected.
 */
async function readSources<Row extends Source & { id: string }>(
  sources: readonly Row[],
  accounts: readonly Calendar.Account[],
  ranges: readonly Calendar.Range[],
): Promise<{
  reachable: { source: Row; reader: Calendar.SourceReader; events: Calendar.Event[] }[]
  unreachable: Row[]
}> {
  const readers = sources.map(source => readerFor(source, accounts))
  const outcomes = await Promise.allSettled(
    readers.map(reader => Promise.all(ranges.map(range => reader.listEvents(range)))),
  )
  const reachable: { source: Row; reader: Calendar.SourceReader; events: Calendar.Event[] }[] = []
  const unreachable: Row[] = []
  for (const [index, source] of sources.entries()) {
    const outcome = outcomes[index]
    const reader = readers[index]
    if (outcome?.status === 'fulfilled' && reader) {
      reachable.push({ source, reader, events: uniqueById(outcome.value.flat()) })
    } else {
      console.warn(
        'A calendar source did not answer',
        source.name,
        outcome?.status === 'rejected' ? outcome.reason : '',
      )
      unreachable.push(source)
    }
  }
  return { reachable, unreachable }
}

const readers = { readerFor, mainAccount, readSources }

export default readers
