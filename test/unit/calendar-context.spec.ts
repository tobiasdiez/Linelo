import * as schema from '#server/db/schema'
import { describe, expect, it, vi } from 'vite-plus/test'
import calendarFakes from './calendar-fakes'
import loadContext from '#server/calendar/context'
import testDatabase from './test-database'

const NOW = new Date('2026-11-17T12:00:00Z')

async function setupContext() {
  const database = await testDatabase()
  const [user] = await database.db
    .insert(schema.users)
    .values({ email: 'mara@northwind.co', displayName: 'Mara Lindqvist' })
    .returning()
  if (!user) {
    throw new Error('User was not created')
  }
  const tokens: Mail.TokenSource = {
    accessToken: vi.fn<Mail.TokenSource['accessToken']>(async () => 'stored'),
  }
  const { provider } = calendarFakes.fakeProvider()
  const dependencies = { db: database.db, providers: { microsoft: provider }, tokens }
  return { db: database.db, userId: user.id, dependencies }
}

describe('calendar context', () => {
  it('asks for calendar access when no account has a calendar', async () => {
    expect.hasAssertions()
    const { userId, dependencies } = await setupContext()

    await expect(loadContext(dependencies, { userId, now: NOW })).rejects.toMatchObject({
      kind: 'consent',
    })
  })

  it('makes the oldest account with a calendar the main one', async () => {
    expect.hasAssertions()
    const { db, userId, dependencies } = await setupContext()
    const [first, second] = await db
      .insert(schema.accounts)
      .values([
        { userId, providerId: 'microsoft', accountId: 'work', createdAt: new Date('2026-01-01') },
        { userId, providerId: 'microsoft', accountId: 'home', createdAt: new Date('2026-02-01') },
      ])
      .returning()

    const context = await loadContext(dependencies, { userId, now: NOW })

    expect({
      accounts: context.accounts.map(account => account.connection.account.id),
      main: context.main.connection.account.id,
      now: context.now,
    }).toStrictEqual({ accounts: [first?.id, second?.id], main: first?.id, now: NOW })
  })
})
