import createDatabase from '../db/client'

/** Where development data lives when no DATABASE_URL is set. Gitignored; delete it to start over. */
const developmentDataDir = '.data/pglite'

function connect(): ReturnType<typeof createDatabase> {
  const url = process.env.DATABASE_URL
  if (url) {
    return createDatabase({ kind: 'postgres', url })
  }
  if (import.meta.dev) {
    return createDatabase({ kind: 'pglite', dataDir: developmentDataDir })
  }
  throw new Error(
    'DATABASE_URL is not set. Outside development Linelo needs a PostgreSQL connection string.',
  )
}

/** The application database: PostgreSQL through DATABASE_URL, or an embedded PGlite in development. */
const database = connect()

export default database
