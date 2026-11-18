import * as schema from '#server/db/schema'
import { describe, expect, it } from 'vite-plus/test'
import calendarFakes from './calendar-fakes'
import { eq } from 'drizzle-orm'
import sources from '#server/calendar/sources'

const { bodyOf } = calendarFakes
const NOW = new Date('2026-11-17T12:00:00Z')

describe('calendar sources', () => {
  it('lists the main calendar first, marked, and the others with their sources', async () => {
    expect.hasAssertions()
    const setup = await calendarFakes.setup()
    const robotics = await setup.addSource('calendar-robotics')
    setup.fake.addCalendar('calendar-choir')

    const listed = bodyOf(await sources.listAvailable(setup.dependencies(NOW), setup.userId))

    expect(listed).toStrictEqual({
      account: {
        id: setup.account.connection.account.id,
        address: setup.account.connection.account.address,
      },
      calendars: [
        { kind: 'outlook', externalId: 'calendar-main', name: 'Calendar', main: true },
        {
          kind: 'outlook',
          externalId: 'calendar-robotics',
          name: 'calendar-robotics',
          main: false,
          sourceId: robotics,
        },
        { kind: 'outlook', externalId: 'calendar-choir', name: 'calendar-choir', main: false },
      ],
    })
  })

  it('refuses the main calendar, and a calendar the account does not list', async () => {
    expect.hasAssertions()
    const setup = await calendarFakes.setup()

    const refused = await Promise.all([
      sources.add(setup.dependencies(NOW), setup.userId, {
        kind: 'outlook',
        externalId: 'calendar-main',
      }),
      sources.add(setup.dependencies(NOW), setup.userId, {
        kind: 'outlook',
        externalId: 'calendar-unknown',
      }),
    ])

    expect(refused).toStrictEqual([
      { refusal: 'invalid', message: 'That is your main calendar' },
      { refusal: 'not-found', message: 'No such calendar' },
    ])
    await expect(setup.db.select().from(schema.calendarSources)).resolves.toStrictEqual([])
  })

  it('removes softly, keeps the decisions, and clears the removal when added again', async () => {
    expect.hasAssertions()
    const setup = await calendarFakes.setup()
    setup.fake.addCalendar('calendar-robotics')
    const request = { kind: 'outlook', externalId: 'calendar-robotics' } as const
    const added = bodyOf(await sources.add(setup.dependencies(NOW), setup.userId, request))
    await setup.db.insert(schema.calendarDecisions).values({
      userId: setup.userId,
      sourceId: added.id,
      sourceEventId: 'event',
      decision: 'dismissed',
    })

    const removed = await sources.remove(setup.dependencies(NOW), setup.userId, added.id)
    const [whileRemoved] = await setup.db
      .select({ removedAt: schema.calendarSources.removedAt })
      .from(schema.calendarSources)
      .where(eq(schema.calendarSources.id, added.id))
    const later = new Date(NOW.getTime() + 1)
    const removedAgain = await sources.remove(setup.dependencies(later), setup.userId, added.id)
    const [stillFirstRemoval] = await setup.db
      .select({ removedAt: schema.calendarSources.removedAt })
      .from(schema.calendarSources)
      .where(eq(schema.calendarSources.id, added.id))
    const again = bodyOf(await sources.add(setup.dependencies(NOW), setup.userId, request))
    const after = await sources.active(setup.db, setup.userId)
    const kept = await setup.db.select().from(schema.calendarDecisions)

    expect({ added, removed, removedAgain, again }).toStrictEqual({
      added: { id: added.id, name: 'calendar-robotics' },
      removed: { result: 'done', body: undefined },
      removedAgain: { result: 'done', body: undefined },
      again: { id: added.id, name: 'calendar-robotics' },
    })
    // A second removal keeps the time of the first
    expect([whileRemoved?.removedAt, stillFirstRemoval?.removedAt]).toStrictEqual([NOW, NOW])
    // The database answers null for an empty column
    // eslint-disable-next-line unicorn/no-null
    expect(after).toMatchObject([{ id: added.id, removedAt: null }])
    expect(kept).toHaveLength(1)
  })

  it("does not remove another user's source", async () => {
    expect.hasAssertions()
    const setup = await calendarFakes.setup()
    const others = await setup.addSource('calendar-jonas', {
      userId: setup.otherUserId,
      accountId: setup.otherAccountId,
    })

    const removed = await sources.remove(setup.dependencies(NOW), setup.userId, others)

    expect(removed).toStrictEqual({ refusal: 'not-found', message: 'No such calendar source' })
    await expect(sources.active(setup.db, setup.otherUserId)).resolves.toHaveLength(1)
  })

  it('refreshes cached names, and keeps listing a source the account stopped listing', async () => {
    expect.hasAssertions()
    const setup = await calendarFakes.setup()
    const renamed = await setup.addSource('calendar-robotics', { name: 'Robotics' })
    const unshared = await setup.addSource('calendar-unshared', { name: 'Old club' })
    setup.fake.provider.listCalendars.mockResolvedValueOnce([
      { externalId: 'calendar-main', name: 'Calendar', isDefault: true },
      { externalId: 'calendar-robotics', name: 'Robotics Club', isDefault: false },
    ])

    const listed = bodyOf(await sources.listAvailable(setup.dependencies(NOW), setup.userId))
    const [row] = await setup.db
      .select({ name: schema.calendarSources.name })
      .from(schema.calendarSources)
      .where(eq(schema.calendarSources.id, renamed))

    expect(listed.calendars.map(calendar => [calendar.name, calendar.sourceId])).toStrictEqual([
      ['Calendar', undefined],
      ['Robotics Club', renamed],
      ['Old club', unshared],
    ])
    expect(row?.name).toBe('Robotics Club')
  })

  it('reads a well-formed request, and says what is wrong with others', () => {
    expect(
      [
        { kind: 'outlook', externalId: 'calendar' },
        { kind: 'outlook', externalId: '' },
        { kind: 'ics', externalId: 'https://example.com/feed.ics' },
        undefined,
      ].map(value => sources.parseRequest(value)),
    ).toStrictEqual([
      { kind: 'outlook', externalId: 'calendar' },
      'externalId must name one of your calendars',
      'Unknown calendar kind',
      'externalId must name one of your calendars',
    ])
  })
})
