import * as schema from './schema'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle as drizzleNodePostgres } from 'drizzle-orm/node-postgres'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migrateNodePostgres } from 'drizzle-orm/node-postgres/migrator'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'

interface Database {
  /** The Drizzle instance, typed the same for both drivers so the rest of the server does not care which one runs. */
  db: PgDatabase<PgQueryResultHKT, typeof schema>
  /** Applies the drizzle-kit migrations in the folder that the database does not have yet, with Drizzle's migrator for this driver. */
  migrate: (migrationsFolder: string) => Promise<void>
  /** Closes the connection pool, or the embedded database. */
  close: () => Promise<void>
}

type Connection =
  /** Any PostgreSQL reachable through a connection string, Neon in production. */
  | { kind: 'postgres'; url: string }
  /** Embedded PostgreSQL (PGlite): persisted under `dataDir`, or in memory when omitted. */
  | { kind: 'pglite'; dataDir?: string }

const casing = 'snake_case'

/** Opens the database behind `connection`. The driver connects on the first query. */
function createDatabase(connection: Connection): Database {
  if (connection.kind === 'postgres') {
    const db = drizzleNodePostgres({
      connection: { connectionString: connection.url },
      schema,
      casing,
    })
    return {
      db,
      migrate: migrationsFolder => migrateNodePostgres(db, { migrationsFolder }),
      close: () => db.$client.end(),
    }
  }
  const db =
    connection.dataDir === undefined
      ? drizzlePglite({ schema, casing })
      : drizzlePglite({ connection: { dataDir: connection.dataDir }, schema, casing })
  return {
    db,
    migrate: migrationsFolder => migratePglite(db, { migrationsFolder }),
    close: () => db.$client.close(),
  }
}

export default createDatabase
