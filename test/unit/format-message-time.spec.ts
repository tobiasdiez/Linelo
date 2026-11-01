import { describe, expect, it } from 'vite-plus/test'
import formatMessageTime from '~/utils/format-message-time'

// Pinned, so the expectations hold on any machine
const TIME_ZONE = 'Europe/Berlin'
const now = new Date('2026-11-04T10:30:00+01:00')

function format(isoDate: string): string {
  return formatMessageTime.short(new Date(isoDate), now, TIME_ZONE)
}

describe('message time', () => {
  it('says today for messages from the same day', () => {
    expect(format('2026-11-04T09:14:00+01:00')).toBe('Today, 09:14')
  })

  it('says yesterday for messages from the day before', () => {
    expect(format('2026-11-03T17:02:00+01:00')).toBe('Yesterday, 17:02')
  })

  it('uses calendar days in the given time zone', () => {
    // 23:30 UTC on the 3rd is already the 4th in Berlin
    expect(format('2026-11-03T23:30:00Z')).toBe('Today, 00:30')
  })

  it('shows the weekday within the last week', () => {
    expect(format('2026-11-02T11:40:00+01:00')).toBe('Mon 11:40')
    expect(format('2026-10-29T08:05:00+01:00')).toBe('Thu 08:05')
  })

  it('shows the date for older messages', () => {
    expect(format('2026-10-28T09:14:00+01:00')).toBe('28 Oct, 09:14')
    expect(format('2026-03-12T09:14:00+01:00')).toBe('12 Mar, 09:14')
  })

  it('shows the date for messages dated in the future', () => {
    expect(format('2026-11-05T09:14:00+01:00')).toBe('5 Nov, 09:14')
  })

  it('spells out the full date and time', () => {
    // The comma after the weekday depends on the ICU version
    expect(formatMessageTime.full(new Date('2026-03-12T09:14:00+01:00'), TIME_ZONE)).toMatch(
      /^Thursday,? 12 March 2026 at 09:14$/,
    )
  })
})
