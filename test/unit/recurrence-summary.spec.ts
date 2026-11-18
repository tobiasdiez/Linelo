import { describe, expect, it } from 'vite-plus/test'
import recurrenceSummary from '#server/calendar/recurrence-summary'

const NO_END = { type: 'noEnd', startDate: '2026-11-02' }

function weekly(daysOfWeek: string[], interval = 1, range: unknown = NO_END) {
  return { pattern: { type: 'weekly', interval, daysOfWeek, firstDayOfWeek: 'sunday' }, range }
}

describe('recurrence summary', () => {
  it.each([
    ['a weekly series', weekly(['monday']), 'Every week on Monday'],
    [
      'a series every two weeks on two days, with an end date',
      weekly(['thursday', 'tuesday'], 2, {
        type: 'endDate',
        startDate: '2026-11-03',
        endDate: '2026-12-20',
      }),
      'Every 2 weeks on Tuesday and Thursday, until 20 Dec',
    ],
    [
      'three weekdays, Monday first',
      weekly(['friday', 'monday', 'wednesday']),
      'Every week on Monday, Wednesday and Friday',
    ],
    [
      'a monthly series with a number of occurrences',
      {
        pattern: { type: 'absoluteMonthly', interval: 1, dayOfMonth: 1 },
        range: { type: 'numbered', startDate: '2026-12-01', numberOfOccurrences: 10 },
      },
      'Every month on the 1st, 10 times',
    ],
    [
      'one occurrence only',
      {
        pattern: { type: 'absoluteMonthly', interval: 3, dayOfMonth: 22 },
        range: { type: 'numbered', startDate: '2026-12-22', numberOfOccurrences: 1 },
      },
      'Every 3 months on the 22nd, 1 time',
    ],
    ['a daily series', { pattern: { type: 'daily', interval: 1 }, range: NO_END }, 'Every day'],
    ['every other day', { pattern: { type: 'daily', interval: 2 }, range: NO_END }, 'Every 2 days'],
    [
      'a relative monthly series',
      {
        pattern: { type: 'relativeMonthly', interval: 1, daysOfWeek: ['monday'], index: 'first' },
        range: NO_END,
      },
      'Every month on the first Monday',
    ],
    [
      'a relative monthly series on the last weekday',
      {
        pattern: { type: 'relativeMonthly', interval: 2, daysOfWeek: ['friday'], index: 'last' },
        range: NO_END,
      },
      'Every 2 months on the last Friday',
    ],
    [
      'a yearly series',
      { pattern: { type: 'absoluteYearly', interval: 1, dayOfMonth: 14, month: 3 }, range: NO_END },
      'Every year on 14 March',
    ],
    [
      'a relative yearly series',
      {
        pattern: {
          type: 'relativeYearly',
          interval: 1,
          daysOfWeek: ['tuesday'],
          index: 'second',
          month: 3,
        },
        range: NO_END,
      },
      'Every year on the second Tuesday of March',
    ],
    [
      'an end date in another year',
      weekly(['monday'], 1, { type: 'endDate', startDate: '2026-11-02', endDate: '2027-02-01' }),
      'Every week on Monday, until 1 Feb 2027',
    ],
    [
      'a series without a range',
      { pattern: { type: 'weekly', daysOfWeek: ['sunday'] } },
      'Every week on Sunday',
    ],
  ])('describes %s', (_, recurrence, summary) => {
    expect(recurrenceSummary(recurrence)).toBe(summary)
  })

  it.each([
    ['nothing', undefined],
    ['no pattern', { range: NO_END }],
    ['an unknown pattern type', { pattern: { type: 'hourly', interval: 1 }, range: NO_END }],
    ['a weekly pattern without days', weekly([])],
    ['an unknown weekday', weekly(['monday', 'funday'])],
    ['a zero interval', weekly(['monday'], 0)],
    ['a month out of range', { pattern: { type: 'absoluteYearly', dayOfMonth: 1, month: 13 } }],
    [
      'a broken end date',
      weekly(['monday'], 1, { type: 'endDate', startDate: '2026-11-02', endDate: 'soon' }),
    ],
    [
      'a numbered range without a count',
      weekly(['monday'], 1, { type: 'numbered', startDate: '2026-11-02' }),
    ],
  ])('says "Repeats" for %s', (_, recurrence) => {
    expect(recurrenceSummary(recurrence)).toBe('Repeats')
  })
})
