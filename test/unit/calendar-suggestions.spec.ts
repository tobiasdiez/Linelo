import { describe, expect, it } from 'vite-plus/test'
import calendarFakes from './calendar-fakes'
import suggestions from '#server/calendar/suggestions'

const { event } = calendarFakes
const NOW = new Date('2026-11-17T12:00:00Z')
// Monday 16 to Monday 23 November, midnight in Berlin
const WEEK = { from: '2026-11-15T23:00:00Z', to: '2026-11-22T23:00:00Z' }
const robotics = { id: 'source-robotics', name: 'Robotics Club' }
const seminar = { id: 'source-seminar', name: 'Department seminar' }

function suggest(
  events: Calendar.Event[],
  {
    main = [],
    decided = new Set<string>(),
    range = WEEK,
  }: { main?: Calendar.Event[]; decided?: Set<string>; range?: Calendar.Range } = {},
): Calendar.Suggestion[] {
  return suggestions.suggest({
    range,
    now: NOW,
    sources: [{ source: robotics, events }],
    main,
    decided,
  })
}

function titles(list: Calendar.Suggestion[]): string[] {
  return list.map(entry => entry.event.title)
}

describe('calendar suggestions', () => {
  it('offers events ahead, and drops cancelled, private, moved and past ones', () => {
    const list = suggest([
      event({ id: 'build-night', title: 'Build night' }),
      event({ id: 'cancelled', cancelled: true }),
      event({ id: 'private', private: true }),
      event({ id: 'moved', exception: true, seriesMasterId: 'series' }),
      event({ id: 'past', start: '2026-11-17T08:00:00Z', end: '2026-11-17T09:00:00Z' }),
    ])

    expect(titles(list)).toStrictEqual(['Build night'])
    expect(list[0]).toMatchObject({
      key: 'source-robotics:build-night',
      sourceId: 'source-robotics',
      eventId: 'build-night',
      source: { name: 'Robotics Club' },
      overlaps: false,
    })
  })

  it('offers an all-day event of today until it is over', () => {
    const today = event({ id: 'today', allDay: true, start: '2026-11-17', end: '2026-11-18' })
    const yesterday = event({
      id: 'yesterday',
      allDay: true,
      start: '2026-11-16',
      end: '2026-11-17',
    })

    expect(titles(suggest([today, yesterday]))).toStrictEqual(['today'])
  })

  it('leaves out what is in the main calendar already', () => {
    const invitation = event({ id: 'meeting', iCalUId: 'shared-ical' })

    expect(
      suggest([invitation], { main: [event({ id: 'mine', iCalUId: 'shared-ical' })] }),
    ).toStrictEqual([])
  })

  it('makes a series one suggestion at its first occurrence ahead in the range', () => {
    const occurrences = [
      '2026-11-17T08:00:00Z',
      '2026-11-18T08:00:00Z',
      '2026-11-19T08:00:00Z',
    ].map((start, index) =>
      event({
        id: `daily-${index}`,
        seriesMasterId: 'daily',
        title: 'Daily check-in',
        start,
        end: start.replace('08:00', '08:15'),
      }),
    )

    const list = suggestions.withSummaries(
      suggestions.suggest({
        range: WEEK,
        now: NOW,
        sources: [{ source: robotics, events: occurrences.toReversed() }],
        main: [],
        decided: new Set(),
      }),
      new Map([['source-robotics:daily', 'Every day']]),
    )

    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      key: 'source-robotics:daily',
      eventId: 'daily',
      event: { id: 'daily-1', start: '2026-11-18T08:00:00Z' },
      series: { summary: 'Every day' },
    })
  })

  it('says a series repeats when its pattern is not known', () => {
    const [entry] = suggest([event({ id: 'occurrence', seriesMasterId: 'weekly' })])

    expect(entry?.series).toStrictEqual({ summary: 'Repeats' })
  })

  it('leaves out what was decided', () => {
    const list = suggest([event({ id: 'decided' }), event({ id: 'open' })], {
      decided: new Set(['source-robotics:decided']),
    })

    expect(titles(list)).toStrictEqual(['open'])
  })

  it('keeps to the range, by start, with all-day dates in any zone', () => {
    const list = suggest([
      event({ id: 'sunday-night', start: '2026-11-22T22:30:00Z', end: '2026-11-22T23:30:00Z' }),
      event({ id: 'monday-after', start: '2026-11-22T23:00:00Z', end: '2026-11-23T00:00:00Z' }),
      event({ id: 'saturday', allDay: true, start: '2026-11-21', end: '2026-11-22' }),
      event({ id: 'next-monday', allDay: true, start: '2026-11-23', end: '2026-11-24' }),
    ])

    expect(titles(list)).toStrictEqual(['saturday', 'sunday-night'])
  })

  it('sorts by start across sources', () => {
    const list = suggestions.suggest({
      range: WEEK,
      now: NOW,
      sources: [
        {
          source: robotics,
          events: [
            event({ id: 'late', start: '2026-11-20T18:00:00Z', end: '2026-11-20T19:00:00Z' }),
          ],
        },
        {
          source: seminar,
          events: [
            event({ id: 'early', start: '2026-11-18T09:00:00Z', end: '2026-11-18T10:00:00Z' }),
          ],
        },
      ],
      main: [],
      decided: new Set(),
    })

    expect(list.map(entry => entry.key)).toStrictEqual([
      'source-seminar:early',
      'source-robotics:late',
    ])
  })

  it('tags a suggestion that overlaps one of your timed events', () => {
    const main = [
      event({ id: 'sync', start: '2026-11-19T09:00:00Z', end: '2026-11-19T10:00:00Z' }),
      event({ id: 'holiday', allDay: true, start: '2026-11-20', end: '2026-11-21' }),
    ]
    const list = suggest(
      [
        event({ id: 'talk', start: '2026-11-19T09:30:00Z', end: '2026-11-19T10:30:00Z' }),
        event({ id: 'after', start: '2026-11-19T10:00:00Z', end: '2026-11-19T11:00:00Z' }),
        event({ id: 'friday', start: '2026-11-20T18:00:00Z', end: '2026-11-20T19:00:00Z' }),
      ],
      { main },
    )

    expect(list.map(entry => [entry.eventId, entry.overlaps])).toStrictEqual([
      ['talk', true],
      ['after', false],
      ['friday', false],
    ])
  })

  it('answers whether more waits in the tail up to the horizon, leaving out what the week shows', () => {
    const tail = { from: WEEK.to, to: suggestions.horizonEnd(NOW).toISOString() }
    const weekly = [
      event({
        id: 'this-week',
        seriesMasterId: 'club',
        start: '2026-11-18T17:00:00Z',
        end: '2026-11-18T18:00:00Z',
      }),
      event({
        id: 'next-week',
        seriesMasterId: 'club',
        start: '2026-11-25T17:00:00Z',
        end: '2026-11-25T18:00:00Z',
      }),
    ]
    const input = {
      now: NOW,
      sources: [{ source: robotics, events: weekly }],
      main: [],
      decided: new Set<string>(),
    }
    const shown = suggestions.suggest({ ...input, range: WEEK })
    const exclude = new Set(shown.map(entry => entry.key))

    expect({
      withSeries: suggestions.suggest({ ...input, range: tail }).length > 0,
      withoutShown: suggestions.suggest({ ...input, range: tail, exclude }).length > 0,
    }).toStrictEqual({ withSeries: true, withoutShown: false })
    expect(suggestions.horizonEnd(NOW).toISOString()).toBe('2026-12-17T12:00:00.000Z')
  })
})
