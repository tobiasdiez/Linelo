import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/*
 * The database schema.
 *
 * Column names are derived from the property names in snake_case (see the
 * `casing` option in `client.ts` and `drizzle.config.ts`).
 *
 * After changing anything here, run `pnpm db:generate` and commit the
 * migration it writes to `server/db/migrations`.
 */

/** People who signed in to Linelo. Everything else hangs off a user. */
export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  displayName: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})
