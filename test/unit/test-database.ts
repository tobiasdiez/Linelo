/// <reference types="node" />
import createDatabase from '#server/db/client'
import { join } from 'node:path'
import { onTestFinished } from 'vite-plus/test'

const migrationsFolder = join(import.meta.dirname, '../../server/db/migrations')

/** A fresh in-memory database with all migrations applied, closed when the test finishes. */
async function testDatabase(): Promise<ReturnType<typeof createDatabase>> {
  const database = createDatabase({ kind: 'pglite' })
  onTestFinished(() => database.close())
  await database.migrate(migrationsFolder)
  return database
}

export default testDatabase
