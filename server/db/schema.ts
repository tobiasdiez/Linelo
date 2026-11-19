import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

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

/**
 * One row per unread inbox message Linelo knows of (`server/ranking/index-store.ts`):
 * ids, facts and numbers, no subject, text or readable address.
 */
const unreadMessages = pgTable(
  'unread_messages',
  {
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    /** The provider's message id. */
    messageId: text().notNull(),
    /** The provider's conversation id; the queue shows conversations. */
    threadId: text().notNull(),
    receivedAt: timestamp({ withTimezone: true }).notNull(),
    /** What the rules need. Null while only the id is known. */
    facts: jsonb().$type<Ranking.Facts>(),
    /** The judge's answers on the complete text. Null until judged. */
    answers: jsonb().$type<Ranking.Answers>(),
    /** The `Judge.id` that gave the answers; another id means "ask again". */
    judge: text(),
    /** When the judge was last asked without getting an answer; it is asked again ten minutes later at the earliest. */
    triedAt: timestamp({ withTimezone: true }),
    /** The score the queue is ordered by. Null while `facts` is null: such a row is not shown yet. */
    score: real(),
    /**
     * Set when the user resolved the message in Linelo, cleared by Undo. The next listing
     * removes the row, or clears this when the mailbox still lists the message as unread
     * two minutes later: the mailbox stays the truth.
     */
    resolvedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  table => [primaryKey({ columns: [table.accountId, table.messageId] })],
)

/** What Linelo keeps per mailbox for ranking (`server/ranking/standing.ts`, `sync.ts`). */
const mailboxProfiles = pgTable('mailbox_profiles', {
  accountId: uuid()
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  /** Whom the account writes to: keyed hash of an address → how often, and when last. */
  correspondents: jsonb().$type<Ranking.Correspondents>().notNull(),
  /**
   * The key's check and the version of the facts: another value means the stored sender keys
   * were hashed with another key, or facts gained a signal; then Sent Items is rescanned and
   * the facts are taken anew, without asking the judge again.
   */
  factsCheck: text().notNull(),
  /** The version of the weights the stored scores were computed with; another one recomputes them. */
  scoresVersion: integer().notNull().default(0),
  /** When Sent Items was last scanned; rescanned after a day. */
  sentScannedAt: timestamp({ withTimezone: true }),
  /** When the unread mail was last listed in full. */
  listedAt: timestamp({ withTimezone: true }),
  /** When a sync last ended with nothing left to judge. */
  syncedAt: timestamp({ withTimezone: true }),
  /** A sync step runs until then; a second one answers that it is busy. */
  syncingUntil: timestamp({ withTimezone: true }),
  ...timestamps(),
})

export {
  users,
  sessions,
  accounts,
  verifications,
  calendarSources,
  calendarDecisions,
  unreadMessages,
  mailboxProfiles,
}
