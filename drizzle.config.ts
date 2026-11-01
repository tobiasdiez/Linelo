/// <reference types="node" />
import { defineConfig } from 'drizzle-kit'

/*
 * Configuration for drizzle-kit (`pnpm db:generate`, `pnpm db:migrate`, `pnpm db:studio`).
 * The server applies the migrations folder itself at startup (see `server/plugins/migrate.ts`),
 * so `db:migrate` is only needed where that is not wanted, for example in a deploy step.
 */

const shared = {
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  casing: 'snake_case',
} as const

// Migrations prefer Neon's direct connection; the pooled one works too
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL

export default url
  ? defineConfig({ ...shared, dbCredentials: { url } })
  : // The embedded database the dev server uses when DATABASE_URL is unset
    defineConfig({ ...shared, driver: 'pglite', dbCredentials: { url: './.data/pglite' } })
