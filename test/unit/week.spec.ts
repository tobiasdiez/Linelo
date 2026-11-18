import { describe, expect, it } from 'vite-plus/test'
import week from '~/utils/week'

describe('weeks', () => {
  it('finds the Monday of a date, Monday first', () => {
    expect(
      ['2026-11-16', '2026-11-19', '2026-11-22', '2026-11-23', '2027-01-01'].map(date =>
        week.mondayOf(date),
      ),
    ).toStrictEqual(['2026-11-16', '2026-11-16', '2026-11-16', '2026-11-23', '2026-12-28'])
  })

  it('takes the current week from the viewer’s zone', () => {
    // Sunday 23:30 in UTC is Monday already in Berlin
    const now = new Date('2026-11-22T23:30:00Z')

    expect(week.currentWeek(now, 'Europe/Berlin')).toBe('2026-11-23')
    expect(week.currentWeek(now, 'America/New_York')).toBe('2026-11-16')
  })

  it('spans the week from midnight to midnight in the zone, DST included', () => {
    expect(week.instants('2026-11-16', 'Europe/Berlin')).toStrictEqual({
      from: '2026-11-15T23:00:00.000Z',
      to: '2026-11-22T23:00:00.000Z',
    })
    // Clocks go back on Sunday 25 October 2026: that week has an hour more
    expect(week.instants('2026-10-19', 'Europe/Berlin')).toStrictEqual({
      from: '2026-10-18T22:00:00.000Z',
      to: '2026-10-25T23:00:00.000Z',
    })
    expect(week.instants('2026-11-16', 'America/Los_Angeles').from).toBe('2026-11-16T08:00:00.000Z')
  })

  it('normalises ?week= to the Monday of its date, and falls back to the current week', () => {
    const current = '2026-11-16'

    expect(
      ['2026-11-26', '2026-11-23', ['2026-11-30', 'x'], '2026-02-30', 'next', undefined].map(
        value => week.parseWeek(value, current),
      ),
    ).toStrictEqual(['2026-11-23', '2026-11-23', '2026-11-30', current, current, current])
  })

  it('names the range, the days and runs of free days', () => {
    expect([
      week.rangeLabel('2026-11-16'),
      week.rangeLabel('2026-11-30'),
      week.rangeLabel('2026-12-28'),
      week.dayLabel('2026-11-19'),
      week.runLabel('2026-11-20', '2026-11-22'),
      week.runLabel('2026-11-28', '2026-12-01'),
    ]).toStrictEqual([
      '16 – 22 November 2026',
      '30 November – 6 December 2026',
      '28 December 2026 – 3 January 2027',
      'Thursday 19 Nov',
      'Friday 20 – Sunday 22 Nov',
      'Saturday 28 Nov – Tuesday 1 Dec',
    ])
  })

  it('lists the seven days', () => {
    expect(week.days('2026-12-28')).toStrictEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ])
  })
})
