import * as schema from '#server/db/schema'
import { describe, expect, it } from 'vite-plus/test'
import MailError from '#server/mail/mail-error'
import calendarFakes from './calendar-fakes'
import decisions from '#server/calendar/decisions'
import { eq } from 'drizzle-orm'

const { event, series, bodyOf } = calendarFakes
const NOW = new Date('2026-11-17T12:00:00Z')
const decidedAlready = { refusal: 'conflict', message: 'Decided already' }

async function setupWithSource() {
  const setup = await calendarFakes.setup()
  const sourceId = await setup.addSource('calendar-robotics', { name: 'Robotics Club' })
  const robotics = setup.fake.calendar('calendar-robotics')
  function decide(eventId: string, decision: Calendar.DecisionVerb = 'accept') {
    return decisions.decide(setup.dependencies(NOW), setup.userId, { sourceId, eventId, decision })
  }
  return { ...setup, sourceId, robotics, decide }
}

function rows(setup: Awaited<ReturnType<typeof setupWithSource>>) {
  return setup.db.select().from(schema.calendarDecisions)
}

describe('calendar decisions: accept', () => {
  it('writes the row first, then the copy with the row as transaction, then its ids', async () => {
    expect.hasAssertions()
    const setup = await setupWithSource()
    setup.robotics.events.push(
      event({ id: 'build-night', title: 'Build night', location: 'Lab 2' }),
    )
    const seen: unknown[] = []
    const create = setup.fake.provider.createEvent.getMockImplementation()
    setup.fake.provider.createEvent.mockImplementationOnce(async (...args) => {
      seen.push(await rows(setup))
      if (!create) {
        throw new Error('No fake createEvent')
      }
      return create(...args)
    })

    const outcome = await setup.decide('build-night')

    const [row] = await rows(setup)
    expect(seen).toStrictEqual([
      // The database answers null for an empty column
      // eslint-disable-next-line unicorn/no-null
      [expect.objectContaining({ decision: 'accepted', copyEventId: null })],
    ])
    expect(setup.fake.provider.createEvent).toHaveBeenCalledExactlyOnceWith(
      setup.account.connection,
      expect.objectContaining({
        subject: 'Build night',
        location: 'Lab 2',
        start: { dateTime: '2026-11-19T17:00:00', timeZone: 'UTC' },
      }),
      row?.id,
    )
    expect(row).toMatchObject({
      sourceEventId: 'build-night',
      copyEventId: 'copy-1',
      copyVersion: 'copy-v1',
      sourceVersion: 'v1',
      sourceEnd: new Date('2026-11-19T19:00:00Z'),
    })
    // The copy as the provider read it back, named after its source
    expect(outcome).toStrictEqual({
      result: 'created',
      body: {
        id: row?.id,
        decision: 'accepted',
        event: expect.objectContaining({
          id: 'copy-1',
          iCalUId: 'copy-1-ical',
          title: 'Build night',
          start: '2026-11-19T17:00:00Z',
          version: 'copy-v1',
          webLink: 'https://outlook.example/copy-1',
          source: { name: 'Robotics Club' },
        }),
      },
    })
  })

  it('accepts once when two tabs accept at the same time: one row, one copy, one transaction', async () => {
    expect.hasAssertions()
    const setup = await setupWithSource()
    setup.robotics.events.push(event({ id: 'build-night' }))

    const outcomes = await Promise.all([setup.decide('build-night'), setup.decide('build-night')])

    const stored = await rows(setup)
    const transactions = setup.fake.provider.createEvent.mock.calls.map(call => call[2])
    // The second one either joins the first (same row, same transaction) or finds it done
    const answers = outcomes.map(outcome =>
      'result' in outcome && outcome.body.id === stored[0]?.id ? 'the row' : outcome,
    )
    expect({
      rows: stored.length,
      copies: [...setup.fake.copies.keys()],
      transactions: [...new Set(transactions)],
      answers: answers.toSorted((first, second) =>
        JSON.stringify(first).localeCompare(JSON.stringify(second)),
      ),
    }).toStrictEqual({
      rows: 1,
      copies: ['copy-1'],
      transactions: [stored[0]?.id],
      answers: expect.arrayContaining(['the row']),
    })
    expect(
      answers.filter(
        answer => answer !== 'the row' && JSON.stringify(answer) !== JSON.stringify(decidedAlready),
      ),
    ).toStrictEqual([])
  })

  it('refuses a decision after one was made', async () => {
    expect.hasAssertions()
    const setup = await setupWithSource()
    setup.robotics.events.push(event({ id: 'build-night' }))
    await setup.decide('build-night')

    const outcomes = await Promise.all([
      setup.decide('build-night'),
      setup.decide('build-night', 'dismiss'),
    ])

    expect(outcomes).toStrictEqual([
      { refusal: 'conflict', message: 'Decided already' },
      { refusal: 'conflict', message: 'Decided already' },
    ])
    expect(setup.fake.copies.size).toBe(1)
    await expect(rows(setup)).resolves.toHaveLength(1)
  })

  it('keeps the row when the copy failed in a way that may have reached Graph, and a retry makes one copy', async () => {
    expect.hasAssertions()
    const setup = await setupWithSource()
    setup.robotics.events.push(event({ id: 'build-night' }))
    const create = setup.fake.provider.createEvent.getMockImplementation()
    // Graph made the copy, but the answer did not come back in time
    setup.fake.provider.createEvent.mockImplementationOnce(async (...args) => {
      await create?.(...args)
      throw new MailError('unavailable', 'Microsoft Graph did not answer')
    })

    await expect(setup.decide('build-night')).rejects.toMatchObject({ kind: 'unavailable' })
    const [kept] = await rows(setup)
    const retried = await setup.decide('build-night')

    const after = await rows(setup)

    expect({
      kept: { decision: kept?.decision, copyEventId: kept?.copyEventId ?? 'none' },
      retried: 'result' in retried && retried.body.id === kept?.id,
      transactions: setup.fake.provider.createEvent.mock.calls.map(call => call[2]),
      copies: [...setup.fake.copies.keys()],
      after: after.map(row => [row.id, row.copyEventId]),
    }).toStrictEqual({
      kept: { decision: 'accepted', copyEventId: 'none' },
      retried: true,
      transactions: [kept?.id, kept?.id],
      copies: ['copy-1'],
      after: [[kept?.id, 'copy-1']],
    })
  })

  it('takes the row back when Graph refused before creating anything, so the user can try again', async () => {
    expect.hasAssertions()
    const setup = await setupWithSource()
    setup.robotics.events.push(event({ id: 'build-night' }))
    setup.fake.provider.createEvent.mockRejectedValueOnce(
      new MailError('consent', 'No calendar access'),
    )

    await expect(setup.decide('build-night')).rejects.toMatchObject({ kind: 'consent' })

    await expect(rows(setup)).resolves.toStrictEqual([])
    expect(bodyOf(await setup.decide('build-night')).decision).toBe('accepted')
  })

  it('does not copy an event that is gone, cancelled, private, over, or a single occurrence', async () => {
    expect.hasAssertions()
    const setup = await setupWithSource()
    setup.robotics.events.push(
      event({ id: 'cancelled', cancelled: true }),
      event({ id: 'private', private: true }),
      event({ id: 'over', start: '2026-11-16T10:00:00Z', end: '2026-11-16T11:00:00Z' }),
      event({ id: 'occurrence', seriesMasterId: 'club' }),
    )

    const outcomes = await Promise.all(
      ['gone', 'cancelled', 'private', 'over', 'occurrence'].map(eventId => setup.decide(eventId)),
    )

    expect(
      outcomes.map(outcome => ('refusal' in outcome ? outcome.message : outcome.result)),
    ).toStrictEqual([
      'No such event',
      'No such event',
      'No such event',
      'No such event',
      'No such event',
    ])
    expect(setup.fake.provider.createEvent).not.toHaveBeenCalled()
    await expect(rows(setup)).resolves.toStrictEqual([])
  })

  it('does not copy what is in the main calendar already', async () => {
    expect.hasAssertions()
    const setup = await setupWithSource()
    setup.robotics.events.push(event({ id: 'all-hands', iCalUId: 'all-hands-ical' }))
    setup.fake.main.push(event({ id: 'mine', iCalUId: 'all-hands-ical' }))

    await expect(setup.decide('all-hands')).resolves.toStrictEqual({
      refusal: 'conflict',
      message: 'Already in your calendar',
    })
    expect(setup.fake.provider.createEvent).not.toHaveBeenCalled()
  })

  it('copies a series from its next occurrence and removes its cancelled dates in the horizon', async () => {
    expect.hasAssertions()
    const setup = await setupWithSource()
    setup.robotics.series.set(
      'club',
      series({
        id: 'club',
        start: '2026-11-19T17:00:00Z',
        end: '2026-11-19T18:00:00Z',
        cancelledDates: ['2026-11-12', '2026-11-26', '2027-03-04'],
      }),
    )

    const outcome = await setup.decide('club')

    const [row] = await rows(setup)
    expect(outcome).toStrictEqual({
      result: 'created',
      body: { id: row?.id, decision: 'accepted' },
    })
    expect(setup.fake.provider.createEvent).toHaveBeenCalledExactlyOnceWith(
      setup.account.connection,
      expect.objectContaining({
        start: { dateTime: '2026-11-19T17:00:00', timeZone: 'UTC' },
        recurrence: expect.objectContaining({ range: { type: 'noEnd', startDate: '2026-11-19' } }),
      }),
      row?.id,
    )
    // The database answers null for an empty column
    // eslint-disable-next-line unicorn/no-null
    expect(row).toMatchObject({ copyEventId: 'copy-1', sourceEnd: null })
    expect(setup.fake.provider.findOccurrence).toHaveBeenCalledExactlyOnceWith(
      setup.account.connection,
      { seriesId: 'copy-1', date: '2026-11-26', timeZone: 'W. Europe Standard Time' },
    )
    expect(setup.fake.deletedOccurrences).toStrictEqual(['copy-1@2026-11-26'])
  })

  it('does not copy a series whose occurrences ahead are in the main calendar already', async () => {
    expect.hasAssertions()
    const setup = await setupWithSource()
    setup.robotics.series.set('club', series({ id: 'club' }))
    setup.robotics.events.push(
      event({ id: 'club-1', seriesMasterId: 'club', iCalUId: 'club-1-ical' }),
    )
    setup.fake.main.push(event({ id: 'mine', iCalUId: 'club-1-ical' }))

    await expect(setup.decide('club')).resolves.toMatchObject({ refusal: 'conflict' })
  })

  it('deletes a copy made after its decision was undone', async () => {
    expect.hasAssertions()
    const setup = await setupWithSource()
    setup.robotics.events.push(event({ id: 'build-night' }))
    setup.fake.provider.createEvent.mockImplementationOnce(async () => {
      await setup.db.delete(schema.calendarDecisions)
      return { id: 'late-copy', version: 'v1' }
    })

    await expect(setup.decide('build-night')).resolves.toStrictEqual({
      refusal: 'conflict',
      message: 'Undone in the meantime',
    })
    expect(setup.fake.provider.deleteEvent).toHaveBeenCalledExactlyOnceWith(
      setup.account.connection,
      'late-copy',
    )
  })
})

describe('calendar decisions: dismiss and undo', () => {
  it('dismisses an event of the source without touching the main calendar', async () => {
    expect.hasAssertions()
    const setup = await setupWithSource()
    setup.robotics.events.push(event({ id: 'concert' }))

    const outcome = await setup.decide('concert', 'dismiss')

    const [row] = await rows(setup)
    expect(outcome).toStrictEqual({
      result: 'created',
      body: { id: row?.id, decision: 'dismissed' },
    })
    // The database answers null for an empty column
    // eslint-disable-next-line unicorn/no-null
    expect(row).toMatchObject({ decision: 'dismissed', copyEventId: null })
    expect(setup.fake.provider.createEvent).not.toHaveBeenCalled()
  })

  it('refuses to dismiss an event the source does not have, and a single occurrence of a series', async () => {
    expect.hasAssertions()
    const setup = await setupWithSource()
    setup.robotics.events.push(event({ id: 'club-1', seriesMasterId: 'club' }))

    const outcomes = await Promise.all([
      setup.decide('unknown', 'dismiss'),
      setup.decide('club-1', 'dismiss'),
    ])

    expect(outcomes).toStrictEqual([
      { refusal: 'not-found', message: 'No such event' },
      { refusal: 'not-found', message: 'No such event' },
    ])
    await expect(rows(setup)).resolves.toStrictEqual([])
  })

  it('takes over an accept that left no copy, and removes the copy Graph made after all', async () => {
    expect.hasAssertions()
    const setup = await setupWithSource()
    setup.robotics.events.push(event({ id: 'build-night' }))
    const create = setup.fake.provider.createEvent.getMockImplementation()
    // Graph made the copy, but the answer was lost
    setup.fake.provider.createEvent.mockImplementationOnce(async (...args) => {
      await create?.(...args)
      throw new MailError('unavailable', 'Microsoft Graph did not answer')
    })
    await expect(setup.decide('build-night')).rejects.toMatchObject({ kind: 'unavailable' })
    const [accepted] = await rows(setup)

    const outcome = await setup.decide('build-night', 'dismiss')

    expect(bodyOf(outcome)).toStrictEqual({ id: accepted?.id, decision: 'dismissed' })
    expect(setup.fake.provider.createEvent.mock.calls.map(call => call[2])).toStrictEqual([
      accepted?.id,
      accepted?.id,
    ])
    expect([...setup.fake.copies.keys()]).toStrictEqual([])
    // The database answers null for an empty column
    // eslint-disable-next-line unicorn/no-null
    await expect(rows(setup)).resolves.toMatchObject([{ decision: 'dismissed', copyEventId: null }])
  })

  it('keeps an accept that left no copy when its copy cannot be checked, so Not for me can be tried again', async () => {
    expect.hasAssertions()
    const setup = await setupWithSource()
    setup.robotics.events.push(event({ id: 'build-night' }))
    setup.fake.provider.createEvent.mockRejectedValueOnce(new MailError('unavailable', 'Down'))
    await expect(setup.decide('build-night')).rejects.toMatchObject({ kind: 'unavailable' })
    setup.fake.provider.createEvent.mockRejectedValueOnce(new MailError('unavailable', 'Down'))

    await expect(setup.decide('build-night', 'dismiss')).rejects.toMatchObject({
      kind: 'unavailable',
    })

    await expect(rows(setup)).resolves.toMatchObject([{ decision: 'accepted' }])
  })

  it('undoes an accept by deleting the copy and the row', async () => {
    expect.hasAssertions()
    const setup = await setupWithSource()
    setup.robotics.events.push(event({ id: 'build-night' }))
    const { id } = bodyOf(await setup.decide('build-night'))

    const outcome = await decisions.undo(setup.dependencies(NOW), setup.userId, id)

    expect(outcome).toStrictEqual({ result: 'done', body: undefined })
    expect(setup.fake.provider.deleteEvent).toHaveBeenCalledExactlyOnceWith(
      setup.account.connection,
      'copy-1',
    )
    expect(setup.fake.copies.size).toBe(0)
    await expect(rows(setup)).resolves.toStrictEqual([])
  })

  it("leaves another user's decision and source alone", async () => {
    expect.hasAssertions()
    const setup = await setupWithSource()
    const othersSource = await setup.addSource('calendar-jonas', {
      userId: setup.otherUserId,
      accountId: setup.otherAccountId,
    })
    const [othersDecision] = await setup.db
      .insert(schema.calendarDecisions)
      .values({
        userId: setup.otherUserId,
        sourceId: othersSource,
        sourceEventId: 'event',
        decision: 'accepted',
        copyEventId: 'jonas-copy',
      })
      .returning()

    const outcomes = await Promise.all([
      decisions.undo(setup.dependencies(NOW), setup.userId, othersDecision?.id ?? ''),
      decisions.undo(setup.dependencies(NOW), setup.userId, 'not-a-uuid'),
      decisions.decide(setup.dependencies(NOW), setup.userId, {
        sourceId: othersSource,
        eventId: 'event',
        decision: 'dismiss',
      }),
    ])

    expect(outcomes).toStrictEqual([
      { refusal: 'not-found', message: 'No such decision' },
      { refusal: 'not-found', message: 'No such decision' },
      { refusal: 'not-found', message: 'No such calendar source' },
    ])
    expect(setup.fake.provider.deleteEvent).not.toHaveBeenCalled()
    await expect(rows(setup)).resolves.toHaveLength(1)
  })
})

describe('calendar decisions: requests', () => {
  it('reads a well-formed request, and says what is wrong with others', async () => {
    expect.hasAssertions()
    const setup = await setupWithSource()
    const valid = { sourceId: setup.sourceId, eventId: 'AAMkAGI2=', decision: 'accept' }
    await setup.db
      .update(schema.calendarSources)
      .set({ removedAt: NOW })
      .where(eq(schema.calendarSources.id, setup.sourceId))

    expect(
      [
        valid,
        { ...valid, decision: 'later' },
        { ...valid, sourceId: 'source' },
        { ...valid, eventId: '' },
        { ...valid, eventId: '../me/messages' },
        { ...valid, eventId: 'with space' },
        undefined,
      ].map(value => decisions.parseRequest(value)),
    ).toStrictEqual([
      valid,
      "decision must be 'accept' or 'dismiss'",
      'sourceId must be the id of one of your calendar sources',
      'eventId must be an event id',
      'eventId must be an event id',
      'eventId must be an event id',
      'The body must be a JSON object',
    ])
    await expect(setup.decide('event', 'dismiss')).resolves.toStrictEqual({
      refusal: 'not-found',
      message: 'No such calendar source',
    })
  })
})
