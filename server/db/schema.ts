import { boolean, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

/*
 * The database schema.
 *
 * Column names are derived from the property names in snake_case (see the
 * `casing` option in `client.ts` and `drizzle.config.ts`).
 *
 * After changing anything here, run `pnpm db:generate` and commit the
 * migration it writes to `server/db/migrations`.
 *
 * Users, sessions, accounts and verifications are written by Better Auth
 * (`server/utils/auth.ts`), so their columns follow its model; it checks them
 * against this schema at runtime.
 */

function timestamps() {
  return {
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  }
}

/** People who signed in to Linelo. Everything else hangs off a user. */
const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  displayName: text().notNull(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  /** When the last full reconcile of calendar copies ran (`server/calendar/sync.ts`), to throttle it. */
  calendarSyncedAt: timestamp({ withTimezone: true }),
  ...timestamps(),
})

/** Signed-in browser sessions. Deleting one signs that browser out. */
const sessions = pgTable(
  'sessions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    ...timestamps(),
  },
  table => [index().on(table.userId)],
)

/**
 * Provider accounts connected to a user, such as a Microsoft mailbox. A user is
 * found through `(providerId, accountId)` of one of their accounts, never
 * through an email address. OAuth tokens are encrypted by Better Auth.
 */
const accounts = pgTable(
  'accounts',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerId: text().notNull(),
    /** The provider's id for the account, for Microsoft the `oid` claim. */
    accountId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    /** Not kept: the mailbox fields below are taken from it, then it is dropped. */
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    /** Granted scopes, comma separated. */
    scope: text(),
    /** Part of Better Auth's model; unused, Linelo has no passwords. */
    password: text(),
    /** The mailbox behind a mail account, used for "you" and reply-all. */
    mailboxAddress: text(),
    mailboxName: text(),
    ...timestamps(),
  },
  table => [unique().on(table.providerId, table.accountId), index().on(table.userId)],
)

/** Short-lived values of the sign-in flow, such as the OAuth state. */
const verifications = pgTable(
  'verifications',
  {
    id: uuid().primaryKey().defaultRandom(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps(),
  },
  table => [index().on(table.identifier)],
)

/**
 * Calendars the user chose to be offered events from (`server/calendar/sources.ts`).
 * A source is read through the reader of its `kind` (`server/calendar/readers.ts`).
 */
const calendarSources = pgTable(
  'calendar_sources',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `outlook`: a calendar in the account's own calendar list. Later kinds (group, ICS) get a reader each. */
    kind: text().notNull(),
    /** The account that reads it; null for kinds that need none. */
    accountId: uuid().references(() => accounts.id, { onDelete: 'cascade' }),
    /** The provider's id for the calendar. */
    externalId: text().notNull(),
    /** Cached from the provider, refreshed whenever the calendar list is fetched. */
    name: text().notNull(),
    /** Soft removal: the decisions stay, so adding the calendar again offers nothing twice. */
    removedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  table => [unique().on(table.userId, table.kind, table.externalId), index().on(table.userId)],
)

/**
 * What the user decided about an event of a source, one row per source event or
 * series (`server/calendar/decisions.ts`). No event content is stored, only ids and versions.
 */
const calendarDecisions = pgTable(
  'calendar_decisions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceId: uuid()
      .notNull()
      .references(() => calendarSources.id, { onDelete: 'cascade' }),
    /** The reader's id of the event; for a series, its master's. */
    sourceEventId: text().notNull(),
    decision: text({ enum: ['accepted', 'dismissed'] }).notNull(),
    /** The copy in the main calendar, filled once the provider created it. */
    copyEventId: text(),
    /** The source's version at the last sync (Graph's changeKey). */
    sourceVersion: text(),
    /** The copy's version after Linelo's last full write; differs once the user edited the copy. */
    copyVersion: text(),
    /** When a single source event ends (past ones are not synced); null for a series. */
    sourceEnd: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  table => [unique().on(table.sourceId, table.sourceEventId), index().on(table.userId)],
)

export { users, sessions, accounts, verifications, calendarSources, calendarDecisions }
