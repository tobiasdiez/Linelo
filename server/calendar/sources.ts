import { and, asc, eq, isNull } from 'drizzle-orm'
import { calendarSources } from '../db/schema'
import isNonEmptyString from '#shared/utils/is-non-empty-string'
import isRecord from '#shared/utils/is-record'

type SourceRow = typeof calendarSources.$inferSelect

/** The kinds this round reads. */
const READABLE_KINDS: readonly Calendar.SourceKind[] = ['outlook']

function isKind(value: unknown): value is Calendar.SourceKind {
  return READABLE_KINDS.some(kind => kind === value)
}

/** Reads the body of `POST /api/calendars/sources`, or says what is wrong with it. */
function parseRequest(value: unknown): Calendar.SourceRequest | string {
  if (!isRecord(value) || !isNonEmptyString(value.externalId)) {
    return 'externalId must name one of your calendars'
  }
  if (!isKind(value.kind)) {
    return 'Unknown calendar kind'
  }
  return { kind: value.kind, externalId: value.externalId }
}

/** The user's sources that are not removed, oldest first. */
function active(db: Calendar.Context['db'], userId: string): Promise<SourceRow[]> {
  return db
    .select()
    .from(calendarSources)
    .where(and(eq(calendarSources.userId, userId), isNull(calendarSources.removedAt)))
    .orderBy(asc(calendarSources.createdAt))
}

/** The user's source rows of an account, removed ones included. */
function rowsOf(
  db: Calendar.Context['db'],
  userId: string,
  accountId: string,
): Promise<SourceRow[]> {
  return db
    .select()
    .from(calendarSources)
    .where(
      and(
        eq(calendarSources.userId, userId),
        eq(calendarSources.kind, 'outlook'),
        eq(calendarSources.accountId, accountId),
      ),
    )
}

/** A calendar as the picker lists it: the main one, or another one with the source it is, if any. */
function listedOf(
  calendar: Calendar.ProviderCalendar,
  row: SourceRow | undefined,
): Calendar.ListedCalendar {
  const listed: Calendar.ListedCalendar = {
    kind: 'outlook',
    externalId: calendar.externalId,
    name: calendar.name,
    main: calendar.isDefault,
  }
  return !calendar.isDefault && row && row.removedAt === null
    ? { ...listed, sourceId: row.id }
    : listed
}

/**
 * The main account's calendars for the picker: the default one marked `main`, then the
 * others with the source they are, if any. Cached names are refreshed; a source the
 * account no longer lists (sharing stopped) stays listed, so it can be removed.
 */
async function listAvailable(
  { db, main }: Calendar.Context,
  userId: string,
): Promise<Calendar.Outcome<Calendar.CalendarsResponse>> {
  const accountId = main.connection.account.id
  const [calendars, rows] = await Promise.all([
    main.provider.listCalendars(main.connection),
    rowsOf(db, userId, accountId),
  ])
  const rowsById = new Map(rows.map(row => [row.externalId, row]))
  const renamed = calendars.filter(calendar => {
    const row = rowsById.get(calendar.externalId)
    return row !== undefined && row.name !== calendar.name
  })
  await Promise.all(
    renamed.map(calendar =>
      db
        .update(calendarSources)
        .set({ name: calendar.name })
        .where(
          and(
            eq(calendarSources.userId, userId),
            eq(calendarSources.kind, 'outlook'),
            eq(calendarSources.externalId, calendar.externalId),
          ),
        ),
    ),
  )
  const listed = calendars
    .toSorted((first, second) => Number(second.isDefault) - Number(first.isDefault))
    .map(calendar => listedOf(calendar, rowsById.get(calendar.externalId)))
  const known = new Set(calendars.map(calendar => calendar.externalId))
  const unlisted = rows
    .filter(row => row.removedAt === null && !known.has(row.externalId))
    .map(row => listedOf({ externalId: row.externalId, name: row.name, isDefault: false }, row))
  return {
    result: 'ok',
    body: {
      account: { id: accountId, address: main.connection.account.address },
      calendars: [...listed, ...unlisted],
    },
  }
}

/**
 * Makes a calendar of the main account a source, or makes a removed one active again (its
 * decisions stayed, so nothing is offered twice). Adding a source twice answers the same id.
 */
async function add(
  { db, main }: Calendar.Context,
  userId: string,
  { kind, externalId }: Calendar.SourceRequest,
): Promise<Calendar.Outcome<Calendar.SourceResponse>> {
  const calendars = await main.provider.listCalendars(main.connection)
  const calendar = calendars.find(entry => entry.externalId === externalId)
  if (!calendar) {
    return { refusal: 'not-found', message: 'No such calendar' }
  }
  if (calendar.isDefault) {
    return { refusal: 'invalid', message: 'That is your main calendar' }
  }
  const accountId = main.connection.account.id
  const [row] = await db
    .insert(calendarSources)
    .values({ userId, kind, accountId, externalId, name: calendar.name })
    .onConflictDoUpdate({
      target: [calendarSources.userId, calendarSources.kind, calendarSources.externalId],
      // JSON and the database have no `undefined`
      // eslint-disable-next-line unicorn/no-null
      set: { removedAt: null, name: calendar.name, accountId },
    })
    .returning({ id: calendarSources.id, name: calendarSources.name })
  if (!row) {
    throw new Error('Adding the calendar source returned no row')
  }
  return { result: 'created', body: row }
}

/** Removes a source softly: its decisions stay. Removing it twice is fine. */
async function remove(
  { db, now }: Calendar.Context,
  userId: string,
  id: string,
): Promise<Calendar.Outcome> {
  const [row] = await db
    .select({ removedAt: calendarSources.removedAt })
    .from(calendarSources)
    .where(and(eq(calendarSources.id, id), eq(calendarSources.userId, userId)))
  if (!row) {
    return { refusal: 'not-found', message: 'No such calendar source' }
  }
  if (row.removedAt === null) {
    await db
      .update(calendarSources)
      .set({ removedAt: now })
      .where(and(eq(calendarSources.id, id), eq(calendarSources.userId, userId)))
  }
  return { result: 'done', body: undefined }
}

const sources = { parseRequest, active, listAvailable, add, remove }

export default sources
