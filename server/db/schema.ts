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

export { users, sessions, accounts, verifications }
