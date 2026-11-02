import database from '../utils/database'

/** Where drizzle-kit writes migrations, relative to the project root like the paths in `drizzle.config.ts`. */
const migrationsFolder = 'server/db/migrations'

/**
 * Development only: applies new migrations whenever the dev server starts, so a
 * migration generated with `pnpm db:generate` is live after the restart. Production
 * databases are migrated at build or deploy time instead (see `modules/database.ts`).
 */
export default defineNitroPlugin(() => {
  if (!import.meta.dev) {
    return
  }
  database.migrate(migrationsFolder).catch((error: unknown) => {
    console.error('Applying the database migrations failed', error)
  })
})
