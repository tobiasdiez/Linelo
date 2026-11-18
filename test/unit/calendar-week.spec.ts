import * as schema from '#server/db/schema'
import { describe, expect, it, vi } from 'vite-plus/test'
import MailError from '#server/mail/mail-error'
import calendarFakes from './calendar-fakes'
import week from '#server/calendar/week'

const { event, series, bodyOf } = calendarFakes
const NOW = new Date('2026-11-17T12:00:00Z')
const WEEK = { from: '2026-11-15T23:00:00Z', to: '2026-11-22T23:00:00Z' }

async function setupWeek() {
  vi.spyOn(console, 'warn').mockReturnValue()
  const setup = await calendarFakes.setup()
  const robotics = await setup.addSource('calendar-robotics', { name: 'Robotics Club' })
  const choir = await setup.addSource('calendar-choir', { name: 'Choir' })
  return { ...setup, robotics, choir }
}

describe('calendar week', () => {
  it('answers the main calendar of the range with the suggestions in it', async () => {
    expect.hasAssertions()
    const setup = await setupWeek()
    setup.fake.main.push(
      event({
        id: 'sync',
        title: 'Weekly sync',
        start: '2026-11-19T09:00:00Z',
        end: '2026-11-19T10:00:00Z',
      }),
      event({ id: 'last-week', start: '2026-11-10T09:00:00Z', end: '2026-11-10T10:00:00Z' }),
    )
    setup.fake.calendar('calendar-robotics').events.push(
      event({ id: 'build-night', title: 'Build night' }),
      event({
        id: 'talk',
        seriesMasterId: 'talks',
        start: '2026-11-19T09:30:00Z',
        end: '2026-11-19T10:30:00Z',
      }),
    )
    setup.fake
      .calendar('calendar-robotics')
      .series.set('talks', series({ id: 'talks', summary: 'Every 2 weeks on Thursday' }))

    const answer = bodyOf(await week.load(setup.dependencies(NOW), setup.userId, WEEK))

    expect(answer.events.map(entry => entry.title)).toStrictEqual(['Weekly sync'])
    expect(
      answer.suggestions.map(entry => [entry.key, entry.series?.summary, entry.overlaps]),
    ).toStrictEqual([
      [`${setup.robotics}:talks`, 'Every 2 weeks on Thursday', true],
      [`${setup.robotics}:build-night`, undefined, false],
    ])
    expect(answer).toMatchObject({ moreLater: false, unreachable: [], sourceCount: 2 })
  })

  it('reads the main calendar and the sources once, up to the horizon, in one tick', async () => {
    expect.hasAssertions()
    const setup = await setupWeek()

    await week.load(setup.dependencies(NOW), setup.userId, WEEK)

    const horizon = { from: WEEK.from, to: '2026-12-17T12:00:00.000Z' }
    expect(setup.fake.provider.listMainEvents).toHaveBeenCalledExactlyOnceWith(
      setup.account.connection,
      horizon,
    )
    const readers = setup.fake.provider.reader.mock.results.map(result => result.value)
    expect(readers.map(reader => vi.mocked(reader.listEvents).mock.calls)).toStrictEqual([
      [[horizon]],
      [[horizon]],
    ])
  })

  it('reads a week straddling now as one range up to the horizon, with the tail from its end', () => {
    expect(week.readRanges(WEEK, NOW)).toStrictEqual({
      reads: [{ from: WEEK.from, to: '2026-12-17T12:00:00.000Z' }],
      tail: { from: '2026-11-22T23:00:00.000Z', to: '2026-12-17T12:00:00.000Z' },
    })
  })

  it('reads the tail apart for a past week, from now', () => {
    const past = { from: '2026-11-01T23:00:00Z', to: '2026-11-08T23:00:00Z' }

    expect(week.readRanges(past, NOW)).toStrictEqual({
      reads: [past, { from: '2026-11-17T12:00:00.000Z', to: '2026-12-17T12:00:00.000Z' }],
      tail: { from: '2026-11-17T12:00:00.000Z', to: '2026-12-17T12:00:00.000Z' },
    })
    expect(
      week.readRanges({ from: '2027-01-03T23:00:00Z', to: '2027-01-10T23:00:00Z' }, NOW),
    ).toStrictEqual({
      reads: [{ from: '2027-01-03T23:00:00Z', to: '2027-01-10T23:00:00Z' }],
    })
  })

  it('says more waits in later weeks, from the tail', async () => {
    expect.hasAssertions()
    const setup = await setupWeek()
    setup.fake
      .calendar('calendar-choir')
      .events.push(
        event({ id: 'concert', start: '2026-12-08T18:00:00Z', end: '2026-12-08T20:00:00Z' }),
      )

    const answer = bodyOf(await week.load(setup.dependencies(NOW), setup.userId, WEEK))

    expect(answer).toMatchObject({ suggestions: [], moreLater: true })
  })

  it('names a source that did not answer, and still answers the week', async () => {
    expect.hasAssertions()
    const setup = await setupWeek()
    setup.fake.calendar('calendar-choir').failure = new MailError('consent', 'Sharing stopped')
    setup.fake.calendar('calendar-robotics').events.push(event({ id: 'build-night' }))

    const answer = bodyOf(await week.load(setup.dependencies(NOW), setup.userId, WEEK))

    expect(answer.unreachable).toStrictEqual(['Choir'])
    expect(answer.suggestions.map(entry => entry.eventId)).toStrictEqual(['build-night'])
  })

  it('fails when the main calendar does not answer', async () => {
    expect.hasAssertions()
    const setup = await setupWeek()
    setup.fake.provider.listMainEvents.mockRejectedValueOnce(
      new MailError('consent', 'No calendar access'),
    )

    await expect(week.load(setup.dependencies(NOW), setup.userId, WEEK)).rejects.toMatchObject({
      kind: 'consent',
    })
  })

  it('names the source of a copy, also for the occurrences of a copied series', async () => {
    expect.hasAssertions()
    const setup = await setupWeek()
    setup.fake.main.push(
      event({ id: 'copy-single', start: '2026-11-19T17:00:00Z', end: '2026-11-19T19:00:00Z' }),
      event({
        id: 'copy-series-occurrence',
        seriesMasterId: 'copy-series',
        start: '2026-11-20T17:00:00Z',
        end: '2026-11-20T18:00:00Z',
      }),
    )
    await setup.db.insert(schema.calendarDecisions).values([
      {
        userId: setup.userId,
        sourceId: setup.robotics,
        sourceEventId: 'build-night',
        decision: 'accepted',
        copyEventId: 'copy-single',
      },
      {
        userId: setup.userId,
        sourceId: setup.choir,
        sourceEventId: 'rehearsal',
        decision: 'accepted',
        copyEventId: 'copy-series',
      },
    ])
    setup.fake.calendar('calendar-robotics').events.push(event({ id: 'build-night' }))

    const answer = bodyOf(await week.load(setup.dependencies(NOW), setup.userId, WEEK))

    expect(answer.events.map(entry => [entry.id, entry.source?.name])).toStrictEqual([
      ['copy-single', 'Robotics Club'],
      ['copy-series-occurrence', 'Choir'],
    ])
    expect(answer.suggestions).toStrictEqual([])
  })

  it('says when no other calendars are chosen', async () => {
    expect.hasAssertions()
    const setup = await calendarFakes.setup()

    await expect(week.load(setup.dependencies(NOW), setup.userId, WEEK)).resolves.toMatchObject({
      result: 'ok',
      body: {
        sourceCount: 0,
        suggestions: [],
      },
    })
  })

  it('accepts a range of instants of at most 8 days', () => {
    expect(
      [
        WEEK,
        { from: '2026-11-16T00:00:00+01:00', to: '2026-11-23T00:00:00+01:00' },
        { from: WEEK.from, to: '2026-11-24T23:00:01Z' },
        { from: WEEK.to, to: WEEK.from },
        { from: '2026-11-16', to: '2026-11-23' },
        { from: WEEK.from },
        undefined,
      ].map(value => typeof week.parseRange(value) !== 'string'),
    ).toStrictEqual([true, true, false, false, false, false, false])
  })
})
