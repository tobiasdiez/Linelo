import { describe, expect, it } from 'vite-plus/test'
import calendarBuilders from '~/data/calendar-builders'
import groupWeek from '~/utils/week-days'

const { monday, today, timeZone, storyWeek, stories, suggestion, sources } = calendarBuilders
/** The fourth suggestion of a day is one too many. */
const FOURTH = 3

function summary(groups: ReturnType<typeof groupWeek>): string[] {
  return groups.map(group =>
    group.kind === 'free'
      ? `free ${group.from}…${group.to}`
      : `${group.date}${group.today ? ' (today)' : ''}: ${group.rows
          .map(row => (row.kind === 'event' ? row.event.title : `[${row.suggestion.event.title}]`))
          .join(', ')}${group.moreFrom.length > 0 ? ` +${group.moreFrom.join('/')}` : ''}`,
  )
}

function friday(groups: ReturnType<typeof groupWeek>): string | undefined {
  return summary(groups).find(line => line.startsWith('2026-11-20'))
}

describe('week days', () => {
  it('interleaves own events and suggestions by start, all-day first, and collapses free days', () => {
    const week = storyWeek()

    expect(
      summary(
        groupWeek({ monday, events: week.events, suggestions: week.suggestions, timeZone, today }),
      ),
    ).toStrictEqual([
      '2026-11-16: 1:1 with Lena, Focus block',
      '2026-11-17 (today): Vendor review call',
      '2026-11-18: Quarterly planning, [Rehearsal]',
      '2026-11-19: Weekly sync, [Optics talk], [Build night]',
      'free 2026-11-20…2026-11-22',
    ])
  })

  it('never collapses today, and keeps a single free day as its own', () => {
    expect(
      summary(groupWeek({ monday, events: [stories.planning], suggestions: [], timeZone, today })),
    ).toStrictEqual([
      'free 2026-11-16…2026-11-16',
      '2026-11-17 (today): ',
      '2026-11-18: Quarterly planning',
      'free 2026-11-19…2026-11-22',
    ])
  })

  it('shows three suggestions a day, the active one always among them, and names the sources of the rest', () => {
    const evening = ['18:00', '19:00', '20:00', '21:00'].map((time, index) =>
      suggestion({
        id: `evening-${index}`,
        title: `Evening ${index + 1}`,
        source: index === FOURTH ? sources.choir : sources.robotics,
        start: `2026-11-20T${time}:00Z`,
        end: `2026-11-20T${time.replace(':00', ':30')}:00Z`,
      }),
    )
    const [first] = evening
    const last = evening.at(-1)

    const shown = groupWeek({
      monday,
      events: [],
      suggestions: evening,
      timeZone,
      today,
      activeKey: first?.key,
    })
    const withLastActive = groupWeek({
      monday,
      events: [],
      suggestions: evening,
      timeZone,
      today,
      activeKey: last?.key,
    })

    expect(friday(shown)).toBe('2026-11-20: [Evening 1], [Evening 2], [Evening 3] +Choir')
    expect(friday(withLastActive)).toBe(
      '2026-11-20: [Evening 1], [Evening 2], [Evening 4] +Robotics Club',
    )
  })

  it('puts an event over several days on each of them, so they are not free', () => {
    expect(
      summary(groupWeek({ monday, events: [stories.offsite], suggestions: [], timeZone, today })),
    ).toStrictEqual([
      'free 2026-11-16…2026-11-16',
      '2026-11-17 (today): ',
      'free 2026-11-18…2026-11-19',
      '2026-11-20: Team offsite',
      '2026-11-21: Team offsite',
      '2026-11-22: Team offsite',
    ])
  })

  it('shows an event that started before the week on its Monday', () => {
    const trip = calendarBuilders.event({
      id: 'trip',
      title: 'Trip',
      start: '2026-11-13',
      end: '2026-11-18',
      allDay: true,
    })

    expect(
      summary(groupWeek({ monday, events: [trip], suggestions: [], timeZone, today }))[0],
    ).toBe('2026-11-16: Trip')
  })
})
