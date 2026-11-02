/// <reference types="node" />
import * as schema from '#server/db/schema'
import { describe, expect, it } from 'vite-plus/test'
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api'
import { readFileSync, readdirSync } from 'node:fs'
import createDatabase from '#server/db/client'
import { join } from 'node:path'

/** What drizzle-kit writes to `meta/*_snapshot.json`. */
type Snapshot = Parameters<typeof generateMigration>[0]

const migrationsFolder = join(import.meta.dirname, '../../server/db/migrations')

function latestSnapshot(): Snapshot {
  const metaFolder = join(migrationsFolder, 'meta')
  const file = readdirSync(metaFolder)
    .filter(name => name.endsWith('_snapshot.json'))
    .toSorted()
    .at(-1)
  if (file === undefined) {
    throw new Error('No snapshot in server/db/migrations/meta')
  }
  // The file is written by drizzle-kit, so its shape is whatever drizzle-kit declares
  // eslint-disable-next-line typescript/no-unsafe-type-assertion
  return JSON.parse(readFileSync(join(metaFolder, file), 'utf8')) as Snapshot
}

describe('database migrations', () => {
  it('create a schema the application can use', async () => {
    expect.hasAssertions()
    const database = createDatabase({ kind: 'pglite' })
    await database.migrate(migrationsFolder)

    await database.db
      .insert(schema.users)
      .values({ email: 'lena@example.com', displayName: 'Lena Hartmann' })

    await expect(
      database.db
        .select({ email: schema.users.email, displayName: schema.users.displayName })
        .from(schema.users),
    ).resolves.toStrictEqual([{ email: 'lena@example.com', displayName: 'Lena Hartmann' }])
    await database.close()
  })

  it('can be applied to a migrated database without effect', async () => {
    expect.hasAssertions()
    const database = createDatabase({ kind: 'pglite' })
    await database.migrate(migrationsFolder)
    await database.db
      .insert(schema.users)
      .values({ email: 'lena@example.com', displayName: 'Lena' })

    await expect(database.migrate(migrationsFolder)).resolves.toBeUndefined()

    await expect(
      database.db.select({ email: schema.users.email }).from(schema.users),
    ).resolves.toStrictEqual([{ email: 'lena@example.com' }])
    await database.close()
  })

  it('exist for every change of the schema', async () => {
    expect.hasAssertions()
    const latest = latestSnapshot()
    const current = generateDrizzleJson(schema, latest.id, undefined, 'snake_case')

    // Statements here mean schema.ts changed without `pnpm db:generate`
    await expect(generateMigration(latest, current)).resolves.toStrictEqual([])
  })
})
