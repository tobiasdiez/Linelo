/**
 * The calendar's clock and the viewer's time zone, in one object so tests can pin
 * both (`vi.spyOn(calendarClock, 'now')`). The calendar renders in the browser only,
 * so these are the viewer's.
 */
const calendarClock = {
  now: (): Date => new Date(),
  timeZone: (): string => new Intl.DateTimeFormat().resolvedOptions().timeZone,
}

export default calendarClock
