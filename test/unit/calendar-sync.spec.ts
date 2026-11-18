import * as schema from '#server/db/schema'
import { describe, expect, it, vi } from 'vite-plus/test'
import MailError from '#server/mail/mail-error'
import calendarFakes from './calendar-fakes'
import calendarSync from '#server/calendar/sync'
import decisions from '#server/calendar/decisions'
import { eq } from 'drizzle-orm'

const { event, series, bodyOf } = calendarFakes
const NOW = new Date('2026-11-17T12:00:00Z')
const MINUTE = 60_000
/** Later than the throttle of the full reconcile. */
const AFTER_THROTTLE = 360_000
/** When a run with a failed copy may run the full reconcile again: a minute sooner than the throttle. */
const RETRY_AT = new Date(
  NOW.getTime() - calendarSync.defaultLimits.throttleMs + calendarSync.defaultLimits.retryAfterMs,
)

type Setup = Awaited<ReturnType<typeof setupSync>>

async function setupSync() {
  vi.spyOn(console, 'warn').mockReturnValue()
  const setup = await calendarFakes.setup()
  const sourceId = await setup.addSource('calendar-robotics', { name: 'Robotics Club' })
  const robotics = setup.fake.calendar('calendar-robotics')
  return { ...setup, sourceId, robotics }
}

/** Accepts the source event through the real flow, so the row and the copy are as in the app. */
async function accept(setup: Setup, eventId: string): Promise<string> {
  const outcome = await decisions.decide(setup.dependencies(NOW), setup.userId, {
    sourceId: setup.sourceId,
    eventId,
    decision: 'accept',
  })
  return bodyOf(outcome).id
}

async function sync(
  setup: Setup,
  now = NOW,
  options: Parameters<typeof calendarSync.sync>[2] = {},
): Promise<Calendar.SyncResponse> {
  return bodyOf(await calendarSync.sync(setup.dependencies(now), setup.userId, options))
}

async function syncedAt(setup: Setup): Promise<Date | null | undefined> {
  const [user] = await setup.db
    .select({ syncedAt: schema.users.calendarSyncedAt })
    .from(schema.users)
    .where(eq(schema.users.id, setup.userId))
  return user?.syncedAt
}

/** Marks the full reconcile as just run, so only the window is reconciled. */
async function fullRunJustDone(setup: Setup): Promise<void> {
  await setup.db
    .update(schema.users)
    .set({ calendarSyncedAt: NOW })
    .where(eq(schema.users.id, setup.userId))
}

function changed(entry: Calendar.Event, fields: Partial<Calendar.Event>): void {
  Object.assign(entry, fields)
}

async function rowOf(setup: Setup, id: string) {
  const [row] = await setup.db
    .select()
    .from(schema.calendarDecisions)
    .where(eq(schema.calendarDecisions.id, id))
  return row
}

describe('calendar sync: the window', () => {
  it('updates a copy whose source changed, and deletes one whose source was cancelled', async () => {
    expect.hasAssertions()
    const setup = await setupSync()
    const buildNight = event({ id: 'build-night', title: 'Build night' })
    const demoDay = event({
      id: 'demo-day',
      title: 'Demo day',
      start: '2026-11-20T15:00:00Z',
      end: '2026-11-20T17:00:00Z',
    })
    setup.robotics.events.push(buildNight, demoDay)
    const moved = await accept(setup, 'build-night')
    const cancelled = await accept(setup, 'demo-day')
    await fullRunJustDone(setup)
    changed(buildNight, {
      version: 'v2',
      start: '2026-11-19T18:00:00Z',
      end: '2026-11-19T20:00:00Z',
    })
    changed(demoDay, { cancelled: true, version: 'v2' })

    const report = await sync(setup)

    expect(report).toStrictEqual({
      updated: 1,
      removed: [{ title: 'Demo day', source: 'Robotics Club' }],
      unreachable: [],
    })
    expect(setup.fake.copies.get('copy-1')?.content).toMatchObject({
      start: { dateTime: '2026-11-19T18:00:00', timeZone: 'UTC' },
    })
    expect([...setup.fake.copies.keys()]).toStrictEqual(['copy-1'])
    await expect(rowOf(setup, moved)).resolves.toMatchObject({
      sourceVersion: 'v2',
      copyVersion: 'copy-v2',
    })
    await expect(rowOf(setup, cancelled)).resolves.toBeUndefined()
  })

  it('keeps the subject, body and location of a copy the user edited, and takes the new times', async () => {
    expect.hasAssertions()
    const setup = await setupSync()
    const buildNight = event({ id: 'build-night', title: 'Build night', location: 'Lab 2' })
    setup.robotics.events.push(buildNight)
    const id = await accept(setup, 'build-night')
    await fullRunJustDone(setup)
    setup.fake.editCopy('copy-1', { subject: 'Build night (bring the robot)' })
    changed(buildNight, {
      version: 'v2',
      title: 'Build night!',
      location: 'Lab 3',
      start: '2026-11-19T18:00:00Z',
    })

    await sync(setup)
    changed(buildNight, { version: 'v3', end: '2026-11-19T21:00:00Z' })
    await sync(setup)

    expect(
      setup.fake.provider.updateEvent.mock.calls.map(call => Object.keys(call[2]).toSorted()),
    ).toStrictEqual([
      ['end', 'isAllDay', 'start'],
      ['end', 'isAllDay', 'start'],
    ])
    expect(setup.fake.copies.get('copy-1')?.content).toMatchObject({
      subject: 'Build night (bring the robot)',
      start: { dateTime: '2026-11-19T18:00:00' },
      end: { dateTime: '2026-11-19T21:00:00' },
    })
    // Still marked as edited, so the next change keeps the edits too
    await expect(rowOf(setup, id)).resolves.toMatchObject({
      sourceVersion: 'v3',
      copyVersion: 'copy-v1',
    })
  })

  it('reports a source that does not answer once, and keeps its copies', async () => {
    expect.hasAssertions()
    const setup = await setupSync()
    setup.robotics.events.push(event({ id: 'build-night' }))
    const id = await accept(setup, 'build-night')
    setup.robotics.failure = new MailError('unavailable', 'Sharing stopped')

    const report = await sync(setup)

    expect(report).toStrictEqual({ updated: 0, removed: [], unreachable: ['Robotics Club'] })
    expect(setup.fake.provider.deleteEvent).not.toHaveBeenCalled()
    await expect(rowOf(setup, id)).resolves.toMatchObject({ copyEventId: 'copy-1' })
  })

  it('reports a source that refuses access by name, and does not ask for access itself', async () => {
    expect.hasAssertions()
    const setup = await setupSync()
    setup.robotics.events.push(event({ id: 'build-night' }))
    await accept(setup, 'build-night')
    setup.robotics.failure = new MailError('consent', 'Sharing stopped')

    await expect(sync(setup)).resolves.toStrictEqual({
      updated: 0,
      removed: [],
      unreachable: ['Robotics Club'],
    })
  })

  it('does not read sources that have no copies: the week names those', async () => {
    expect.hasAssertions()
    const setup = await setupSync()
    setup.robotics.failure = new MailError('unavailable', 'Down')

    await expect(sync(setup)).resolves.toStrictEqual({ updated: 0, removed: [], unreachable: [] })
    expect(setup.fake.provider.reader).not.toHaveBeenCalled()
  })

  it('skips a row that was undone while the run was going', async () => {
    expect.hasAssertions()
    const setup = await setupSync()
    const buildNight = event({ id: 'build-night', title: 'Build night' })
    setup.robotics.events.push(buildNight)
    const id = await accept(setup, 'build-night')
    await fullRunJustDone(setup)
    changed(buildNight, { version: 'v2' })
    setup.fake.provider.updateEvent.mockImplementationOnce(async () => {
      await decisions.undo(setup.dependencies(NOW), setup.userId, id)
      return { version: 'copy-v9' }
    })

    await sync(setup)

    await expect(setup.db.select().from(schema.calendarDecisions)).resolves.toStrictEqual([])
  })

  it('deletes at most the cap per run, and the rest in the next', async () => {
    expect.hasAssertions()
    const setup = await setupSync()
    const events = ['one', 'two', 'three'].map((id, index) =>
      event({
        id,
        title: id,
        start: `2026-11-2${index}T10:00:00Z`,
        end: `2026-11-2${index}T11:00:00Z`,
      }),
    )
    setup.robotics.events.push(...events)
    for (const entry of events) {
      // eslint-disable-next-line eslint/no-await-in-loop
      await accept(setup, entry.id)
    }
    await fullRunJustDone(setup)
    for (const entry of events) {
      changed(entry, { cancelled: true })
    }
    const limits = { ...calendarSync.defaultLimits, maxDeletions: 2 }

    const first = await sync(setup, NOW, { limits })
    const second = await sync(setup, NOW, { limits })

    expect(first.removed.map(entry => entry.title)).toStrictEqual(['one', 'two'])
    expect(second.removed.map(entry => entry.title)).toStrictEqual(['three'])
  })

  it('stops when over its time budget', async () => {
    expect.hasAssertions()
    const setup = await setupSync()
    const buildNight = event({ id: 'build-night' })
    setup.robotics.events.push(buildNight)
    await accept(setup, 'build-night')
    changed(buildNight, { cancelled: true })
    const times = [0, calendarSync.defaultLimits.budgetMs + 1]

    const report = await sync(setup, NOW, {
      clock: () => times.shift() ?? Number.POSITIVE_INFINITY,
    })

    expect(report.removed).toStrictEqual([])
    expect(setup.fake.copies.size).toBe(1)
    // The full reconcile did not run, so the next visit runs it
    await expect(syncedAt(setup)).resolves.toBeNull()
  })
})

describe('calendar sync: the full reconcile', () => {
  it('runs at most every 5 minutes, and once for parallel runs', async () => {
    expect.hasAssertions()
    const setup = await setupSync()
    setup.robotics.series.set('club', series({ id: 'club' }))
    await accept(setup, 'club')

    await Promise.all([sync(setup), sync(setup)])
    await sync(setup, new Date(NOW.getTime() + MINUTE))
    await sync(setup, new Date(NOW.getTime() + AFTER_THROTTLE))

    const readers = setup.fake.provider.reader.mock.results.map(result => result.value)
    const seriesReads = readers.reduce(
      (sum, reader) => sum + vi.mocked(reader.getSeries).mock.calls.length,
      0,
    )
    expect(seriesReads).toBe(2)
  })

  it('takes a changed pattern of a series to its copy', async () => {
    expect.hasAssertions()
    const setup = await setupSync()
    setup.robotics.series.set('club', series({ id: 'club' }))
    const id = await accept(setup, 'club')
    const fortnightly = {
      pattern: { type: 'weekly', interval: 2, daysOfWeek: ['thursday'] },
      range: { type: 'noEnd', startDate: '2026-11-19' },
    }
    const changedSeries = series({ id: 'club', version: 'v2' })
    setup.robotics.series.set('club', {
      ...changedSeries,
      recurrence: fortnightly,
      content: { ...changedSeries.content, recurrence: fortnightly },
    })

    const report = await sync(setup)

    expect(report.updated).toBe(1)
    expect(setup.fake.copies.get('copy-1')?.content.recurrence).toStrictEqual(fortnightly)
    await expect(rowOf(setup, id)).resolves.toMatchObject({ sourceVersion: 'v2' })
  })

  it('removes a date cancelled in the source from the copy of a series', async () => {
    expect.hasAssertions()
    const setup = await setupSync()
    setup.robotics.series.set('club', series({ id: 'club' }))
    await accept(setup, 'club')
    setup.robotics.series.set(
      'club',
      series({ id: 'club', cancelledDates: ['2026-11-26', '2027-02-04'] }),
    )

    await sync(setup)

    expect(setup.fake.deletedOccurrences).toStrictEqual(['copy-1@2026-11-26'])
  })

  it('deletes the copy of a gone event while its calendar answers, and keeps it while it does not', async () => {
    expect.hasAssertions()
    const setup = await setupSync()
    const later = event({
      id: 'later',
      title: 'Spring fair',
      start: '2027-03-01T10:00:00Z',
      end: '2027-03-01T16:00:00Z',
    })
    setup.robotics.events.push(later)
    await accept(setup, 'later')
    setup.robotics.events.length = 0
    setup.robotics.failure = new MailError('unavailable', 'Down')

    const whileDown = await sync(setup)
    setup.robotics.failure = undefined
    const afterwards = await sync(setup, new Date(NOW.getTime() + AFTER_THROTTLE))

    expect(whileDown.removed).toStrictEqual([])
    expect(afterwards.removed).toStrictEqual([{ title: 'Spring fair', source: 'Robotics Club' }])
    expect(setup.fake.copies.size).toBe(0)
  })

  it('updates a single event further ahead than the window', async () => {
    expect.hasAssertions()
    const setup = await setupSync()
    const later = event({ id: 'later', start: '2027-03-01T10:00:00Z', end: '2027-03-01T16:00:00Z' })
    setup.robotics.events.push(later)
    await accept(setup, 'later')
    setup.robotics.details.set(
      'later',
      calendarFakes.detailed({ ...later, version: 'v2', start: '2027-03-01T11:00:00Z' }),
    )

    const report = await sync(setup)

    expect(report.updated).toBe(1)
    expect(setup.fake.copies.get('copy-1')?.content.start.dateTime).toBe('2027-03-01T11:00:00')
  })

  it('turns a copy deleted in Outlook into a dismissal, so the event is not offered again', async () => {
    expect.hasAssertions()
    const setup = await setupSync()
    setup.robotics.events.push(event({ id: 'build-night' }))
    const id = await accept(setup, 'build-night')
    setup.fake.copies.clear()

    await sync(setup)

    await expect(rowOf(setup, id)).resolves.toMatchObject({
      decision: 'dismissed',
      // The database answers null for an empty column
      // eslint-disable-next-line unicorn/no-null
      copyEventId: null,
    })
  })

  it('repairs a row left without a copy, with the same transaction', async () => {
    expect.hasAssertions()
    const setup = await setupSync()
    setup.robotics.events.push(event({ id: 'build-night' }))
    const [row] = await setup.db
      .insert(schema.calendarDecisions)
      .values({
        userId: setup.userId,
        sourceId: setup.sourceId,
        sourceEventId: 'build-night',
        decision: 'accepted',
        createdAt: new Date(NOW.getTime() - 2 * MINUTE),
      })
      .returning()
    // The first attempt reached Graph before the process died
    await setup.fake.provider.createEvent(
      setup.account.connection,
      calendarFakes.detailed(event({ id: 'build-night' })).content,
      row?.id ?? '',
    )

    const report = await sync(setup)

    expect(report.updated).toBe(1)
    expect(setup.fake.copies.size).toBe(1)
    await expect(rowOf(setup, row?.id ?? '')).resolves.toMatchObject({
      copyEventId: 'copy-1',
      sourceVersion: 'v1',
    })
  })

  it('leaves a row without a copy alone while its accept may still be running', async () => {
    expect.hasAssertions()
    const setup = await setupSync()
    setup.robotics.events.push(event({ id: 'build-night' }))
    await setup.db.insert(schema.calendarDecisions).values({
      userId: setup.userId,
      sourceId: setup.sourceId,
      sourceEventId: 'build-night',
      decision: 'accepted',
      createdAt: NOW,
    })

    await sync(setup)

    expect(setup.fake.provider.createEvent).not.toHaveBeenCalled()
  })

  it('goes on with the other sources when one fails, and runs again a little sooner', async () => {
    expect.hasAssertions()
    const setup = await setupSync()
    const choirId = await setup.addSource('calendar-choir', { name: 'Choir' })
    const choir = setup.fake.calendar('calendar-choir')
    setup.robotics.series.set('club', series({ id: 'club' }))
    choir.series.set('rehearsal', series({ id: 'rehearsal' }))
    await accept(setup, 'club')
    bodyOf(
      await decisions.decide(setup.dependencies(NOW), setup.userId, {
        sourceId: choirId,
        eventId: 'rehearsal',
        decision: 'accept',
      }),
    )
    choir.series.set(
      'rehearsal',
      series({ id: 'rehearsal', version: 'v2', start: '2026-11-19T19:00:00Z' }),
    )
    const reader = setup.fake.provider.reader.getMockImplementation()
    // Robotics Club lists its events, then fails to read its series
    setup.fake.provider.reader.mockImplementation((connection, calendarId) => {
      const real = reader?.(connection, calendarId)
      if (!real) {
        throw new Error('No fake reader')
      }
      return calendarId === 'calendar-robotics'
        ? { ...real, getSeries: async () => Promise.reject(new MailError('unavailable', 'Down')) }
        : real
    })

    const report = await sync(setup)

    expect(report).toStrictEqual({ updated: 1, removed: [], unreachable: ['Robotics Club'] })
    expect(setup.fake.copies.get('copy-2')?.content.start.dateTime).toBe('2026-11-19T19:00:00')
    // Runs again a minute after the throttle would allow, not on every visit
    await expect(syncedAt(setup)).resolves.toStrictEqual(RETRY_AT)
  })

  it('goes on with the other sources when one fails after listing its window', async () => {
    expect.hasAssertions()
    const setup = await setupSync()
    const choirId = await setup.addSource('calendar-choir', { name: 'Choir' })
    const choir = setup.fake.calendar('calendar-choir')
    setup.robotics.events.push(event({ id: 'build-night', title: 'Build night' }))
    choir.events.push(event({ id: 'rehearsal', title: 'Rehearsal' }))
    await accept(setup, 'build-night')
    bodyOf(
      await decisions.decide(setup.dependencies(NOW), setup.userId, {
        sourceId: choirId,
        eventId: 'rehearsal',
        decision: 'accept',
      }),
    )
    // Both change; Robotics Club lists the change, then fails to read the event
    setup.robotics.events[0] = event({ id: 'build-night', title: 'Build night', version: 'v2' })
    choir.events[0] = event({ id: 'rehearsal', title: 'Rehearsal (moved)', version: 'v2' })
    const reader = setup.fake.provider.reader.getMockImplementation()
    setup.fake.provider.reader.mockImplementation((connection, calendarId) => {
      const real = reader?.(connection, calendarId)
      if (!real) {
        throw new Error('No fake reader')
      }
      return calendarId === 'calendar-robotics'
        ? { ...real, getEvents: async () => Promise.reject(new MailError('unavailable', 'Down')) }
        : real
    })

    const outcome = await calendarSync.sync(setup.dependencies(NOW), setup.userId)

    expect(outcome).toStrictEqual({
      result: 'ok',
      body: { updated: 1, removed: [], unreachable: ['Robotics Club'] },
    })
    expect([...setup.fake.copies.values()].map(copy => copy.content.subject)).toStrictEqual([
      'Build night',
      'Rehearsal (moved)',
    ])
    // The full reconcile ran for the others, and runs again a minute early
    await expect(syncedAt(setup)).resolves.toStrictEqual(RETRY_AT)
  })

  it('keeps going past a copy that fails, and runs again a little sooner, not on every visit', async () => {
    expect.hasAssertions()
    const setup = await setupSync()
    setup.robotics.series.set('club', series({ id: 'club' }))
    setup.robotics.series.set('talks', series({ id: 'talks' }))
    await accept(setup, 'club')
    await accept(setup, 'talks')
    setup.robotics.series.set(
      'club',
      series({ id: 'club', version: 'v2', start: '2026-11-19T10:30:00Z' }),
    )
    setup.robotics.series.set(
      'talks',
      series({ id: 'talks', version: 'v2', start: '2026-11-19T11:30:00Z' }),
    )
    setup.fake.provider.updateEvent.mockRejectedValueOnce(new MailError('unavailable', 'Throttled'))

    const report = await sync(setup)

    const soon = await sync(setup, new Date(NOW.getTime() + MINUTE / 2))
    const later = await sync(
      setup,
      new Date(RETRY_AT.getTime() + calendarSync.defaultLimits.throttleMs + 1),
    )

    expect(report.updated).toBe(1)
    expect(soon.updated).toBe(0)
    // The failed copy is updated by the run after the retry delay
    expect(later.updated).toBe(1)
  })

  it('moves the rows it looked at to the back, leaves the ones the budget skipped in front, and gives past ones no slot', async () => {
    expect.hasAssertions()
    const setup = await setupSync()
    const later = [
      event({ id: 'spring', start: '2027-03-01T10:00:00Z', end: '2027-03-01T11:00:00Z' }),
      event({ id: 'summer', start: '2027-06-01T10:00:00Z', end: '2027-06-01T11:00:00Z' }),
      event({ id: 'autumn', start: '2027-09-01T10:00:00Z', end: '2027-09-01T11:00:00Z' }),
    ]
    setup.robotics.events.push(...later)
    // A copy of an event long over, synced least recently of all
    await setup.db.insert(schema.calendarDecisions).values({
      userId: setup.userId,
      sourceId: setup.sourceId,
      sourceEventId: 'last-year',
      decision: 'accepted',
      copyEventId: 'copy-last-year',
      sourceEnd: new Date('2025-11-17T12:00:00Z'),
      updatedAt: new Date('2025-11-17T12:00:00Z'),
    })
    const [unchanged, updated, skipped] = [
      await accept(setup, 'spring'),
      await accept(setup, 'summer'),
      await accept(setup, 'autumn'),
    ]
    // Summer and autumn change; spring is only looked at
    for (const entry of later.slice(1)) {
      setup.robotics.details.set(entry.id, calendarFakes.detailed({ ...entry, version: 'v2' }))
    }
    const before = await rowOf(setup, skipped)
    // The budget is gone once the first copy was written
    function clock(): number {
      return setup.fake.provider.updateEvent.mock.calls.length > 0 ? Number.POSITIVE_INFINITY : 0
    }
    // Room for the three rows ahead, if the past one takes no slot
    const limits = { ...calendarSync.defaultLimits, maxRows: 3 }

    await sync(setup, NOW, { clock, limits })

    // Unchanged, but looked at: its turn is over too
    await expect(rowOf(setup, unchanged)).resolves.toMatchObject({ updatedAt: NOW })
    await expect(rowOf(setup, updated)).resolves.toMatchObject({ updatedAt: NOW })
    await expect(rowOf(setup, skipped)).resolves.toMatchObject({ updatedAt: before?.updatedAt })
    // Only summer's copy was written
    const summer = await rowOf(setup, updated)
    expect(setup.fake.provider.updateEvent.mock.calls.map(call => call[1])).toStrictEqual([
      summer?.copyEventId,
    ])
    expect(setup.fake.provider.getMainEvents.mock.calls.flatMap(call => call[1])).not.toContain(
      'copy-last-year',
    )
  })
})
