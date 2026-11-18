import { describe, expect, it } from 'vite-plus/test'
import calendarBuilders from '~/data/calendar-builders'
import formatEventTime from '~/utils/format-event-time'

// Pinned, so the expectations hold on any machine
const TIME_ZONE = 'Europe/Berlin'
const { event } = calendarBuilders

function on(entry: Calendar.Event, day: string): [string, boolean] {
  return [
    formatEventTime.timeRange(entry, { timeZone: TIME_ZONE, day }),
    formatEventTime.continues(entry, { timeZone: TIME_ZONE, day }),
  ]
}

describe('event time', () => {
  it('shows a timed event as a range of 24-hour times in the zone', () => {
    const buildNight = event({
      id: 'build',
      title: 'Build night',
      start: '2026-11-19T17:00:00Z',
      end: '2026-11-19T19:00:00Z',
    })

    expect(formatEventTime.timeRange(buildNight, { timeZone: TIME_ZONE })).toBe('18:00 – 20:00')
    expect(formatEventTime.timeRange(buildNight, { timeZone: 'America/New_York' })).toBe(
      '12:00 – 14:00',
    )
  })

  it('says all day for an all-day event, whatever the zone', () => {
    const holiday = event({
      id: 'holiday',
      title: 'Holiday',
      start: '2026-11-18',
      end: '2026-11-19',
      allDay: true,
    })

    expect(formatEventTime.timeRange(holiday, { timeZone: 'Pacific/Auckland' })).toBe('All day')
    expect(formatEventTime.dayOf(holiday, 'Pacific/Auckland')).toBe('2026-11-18')
  })

  it('shows where an event that runs on ends on its first day, and that it continues on the others', () => {
    const conference = event({
      id: 'conference',
      title: 'Conference',
      start: '2026-11-17T08:00:00Z',
      end: '2026-11-19T16:00:00Z',
    })
    const trip = event({
      id: 'trip',
      title: 'Trip',
      start: '2026-11-20',
      end: '2026-11-23',
      allDay: true,
    })

    expect([
      on(conference, '2026-11-17'),
      on(conference, '2026-11-18'),
      on(conference, '2026-11-19'),
      on(trip, '2026-11-20'),
      on(trip, '2026-11-21'),
      on(trip, '2026-11-22'),
    ]).toStrictEqual([
      ['09:00 → 19 Nov', false],
      ['All day', true],
      ['until 17:00', true],
      ['All day → 22 Nov', false],
      ['All day', true],
      ['All day', true],
    ])
  })

  it('keeps an event that ends at midnight on its day', () => {
    const lateShow = event({
      id: 'late',
      title: 'Late show',
      start: '2026-11-19T21:00:00Z',
      end: '2026-11-19T23:00:00Z',
    })

    expect(formatEventTime.timeRange(lateShow, { timeZone: TIME_ZONE })).toBe('22:00 – 00:00')
  })

  it('puts the weekday first for the bottom bar', () => {
    const buildNight = event({
      id: 'build',
      title: 'Build night',
      start: '2026-11-19T17:00:00Z',
      end: '2026-11-19T19:00:00Z',
    })
    const fair = event({
      id: 'fair',
      title: 'Fair',
      start: '2026-11-21',
      end: '2026-11-22',
      allDay: true,
    })

    expect(formatEventTime.withWeekday(buildNight, TIME_ZONE)).toBe('Thu 18:00 – 20:00')
    expect(formatEventTime.withWeekday(fair, TIME_ZONE)).toBe('Sat, all day')
  })

  it('places an event on the day it starts in the zone', () => {
    const night = event({
      id: 'night',
      title: 'Night',
      start: '2026-11-19T23:30:00Z',
      end: '2026-11-20T00:30:00Z',
    })

    expect(formatEventTime.dayOf(night, TIME_ZONE)).toBe('2026-11-20')
    expect(formatEventTime.dayOf(night, 'UTC')).toBe('2026-11-19')
  })

  it('says how a series repeats in running text, short enough for a one-line row', () => {
    expect(
      [
        'Every week on Wednesday',
        'Every week on Monday and Thursday, until 18 Jan 2027',
        'Every 2 weeks on Thursday',
        'Every month on the 3rd',
        'Repeats',
      ].map(summary => formatEventTime.pattern({ summary })),
    ).toStrictEqual([
      'every Wednesday',
      'every Monday and Thursday, until 18 Jan 2027',
      'every 2 weeks on Thursday',
      'every month on the 3rd',
      'repeats',
    ])
    expect(formatEventTime.pattern(undefined)).toBeUndefined()
  })
})
