/*
 * The demo account's calendars: the main calendar and three others to be offered
 * events from, with times relative to `now` so the demo always has something ahead.
 * Times are UTC; the app shows them in the viewer's zone.
 */

import calendarTime from '../utils/calendar-time'

const { MILLISECONDS_PER_DAY, MILLISECONDS_PER_HOUR, MILLISECONDS_PER_MINUTE, DAYS_PER_WEEK } =
  calendarTime
const SATURDAY = 6
/** How long ago the series of the demo started, so their copies have to start from their next occurrence. */
const CLUB_HISTORY_WEEKS = 8
const SEMINAR_HISTORY_WEEKS = 4
const CHOIR_HISTORY_WEEKS = 2
const CHOIR_SEASON_WEEKS = 9
const CONCERT_WEEKS_AHEAD = 3
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** A weekly series: its first occurrence, and Graph's `patternedRecurrence`. */
interface FixtureSeries {
  id: string
  title: string
  location?: string
  /** The first occurrence, as instants. */
  start: string
  end: string
  /** Every `interval` weeks on the weekday of `start`, as Graph describes it. */
  recurrence: {
    pattern: { type: 'weekly'; interval: number; daysOfWeek: string[]; firstDayOfWeek: 'monday' }
    range: {
      type: 'noEnd' | 'endDate'
      startDate: string
      endDate?: string
      recurrenceTimeZone: 'UTC'
    }
  }
  /** Occurrences cancelled in the source, `YYYY-MM-DD`. */
  cancelledDates: string[]
}

interface FixtureCalendar {
  id: string
  name: string
  isDefault: boolean
  events: Calendar.Event[]
  series: FixtureSeries[]
}

interface Offset {
  days: number
  hours?: number
  minutes?: number
}

interface Clock {
  /** An instant `days` after today's UTC midnight, at the given UTC time. */
  at: (offset: Offset) => string
  /** The UTC date `days` after today. */
  date: (offset: Offset) => string
  /** Days from today to the next Saturday (at least one). */
  untilSaturday: number
}

function clockAt(now: Date): Clock {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  function at({ days, hours = 0, minutes = 0 }: Offset): string {
    const offset =
      days * MILLISECONDS_PER_DAY +
      hours * MILLISECONDS_PER_HOUR +
      minutes * MILLISECONDS_PER_MINUTE
    return calendarTime.isoInstant(midnight + offset)
  }
  function date({ days }: Offset): string {
    return calendarTime.dateOf(at({ days }))
  }
  const untilSaturday = ((SATURDAY - now.getUTCDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK) + 1
  return { at, date, untilSaturday }
}

function event(
  fields: Pick<Calendar.Event, 'id' | 'title' | 'start' | 'end'> & Partial<Calendar.Event>,
): Calendar.Event {
  return {
    iCalUId: `${fields.id}-ical`,
    allDay: false,
    cancelled: false,
    private: false,
    exception: false,
    version: `${fields.id}-v1`,
    ...fields,
  }
}

function weekly(
  fields: Pick<FixtureSeries, 'id' | 'title' | 'start' | 'end'> &
    Partial<Pick<FixtureSeries, 'location' | 'cancelledDates'>> & {
      interval?: number
      endDate?: string
    },
): FixtureSeries {
  const { interval = 1, endDate, ...rest } = fields
  const weekday = WEEKDAYS[new Date(fields.start).getUTCDay()] ?? 'monday'
  return {
    cancelledDates: [],
    ...rest,
    recurrence: {
      pattern: { type: 'weekly', interval, daysOfWeek: [weekday], firstDayOfWeek: 'monday' },
      range: {
        type: endDate ? 'endDate' : 'noEnd',
        startDate: calendarTime.dateOf(fields.start),
        ...(endDate ? { endDate } : {}),
        recurrenceTimeZone: 'UTC',
      },
    },
  }
}

function mainCalendar({ at, date }: Clock): FixtureCalendar {
  return {
    id: 'calendar-main',
    name: 'Calendar',
    isDefault: true,
    events: [
      event({
        id: 'main-standup',
        title: 'Team stand-up',
        start: at({ days: -1, hours: 8 }),
        end: at({ days: -1, hours: 8, minutes: 15 }),
      }),
      event({
        id: 'main-lena',
        title: '1:1 with Lena',
        start: at({ days: 0, hours: 8 }),
        end: at({ days: 0, hours: 8, minutes: 30 }),
      }),
      event({
        id: 'main-focus',
        title: 'Focus block',
        start: at({ days: 0, hours: 12 }),
        end: at({ days: 0, hours: 13 }),
      }),
      event({
        id: 'main-vendor',
        title: 'Vendor review call',
        start: at({ days: 1, hours: 9 }),
        end: at({ days: 1, hours: 10 }),
        location: 'Teams',
      }),
      event({
        id: 'main-marco',
        title: 'Call with Marco',
        start: at({ days: 2, hours: 17, minutes: 30 }),
        end: at({ days: 2, hours: 18 }),
      }),
      event({
        id: 'main-planning',
        title: 'Quarterly planning',
        start: date({ days: 3 }),
        end: date({ days: 4 }),
        allDay: true,
      }),
      event({
        id: 'main-offsite',
        title: 'Team offsite',
        start: at({ days: 5, hours: 8 }),
        end: at({ days: 6, hours: 15 }),
        location: 'Lisbon',
      }),
      event({
        id: 'main-all-hands',
        title: 'Department all-hands',
        start: at({ days: 4, hours: 14 }),
        end: at({ days: 4, hours: 15 }),
        iCalUId: 'all-hands-ical',
      }),
    ],
    series: [],
  }
}

function roboticsClub({ at, date, untilSaturday }: Clock): FixtureCalendar {
  return {
    id: 'calendar-robotics',
    name: 'Robotics Club',
    isDefault: false,
    events: [
      event({
        id: 'robotics-build-night',
        title: 'Build night',
        start: at({ days: 1, hours: 17 }),
        end: at({ days: 1, hours: 19 }),
        location: 'Lab 2',
      }),
      event({
        id: 'robotics-competition',
        title: 'Robot competition',
        start: date({ days: untilSaturday }),
        end: date({ days: untilSaturday + 1 }),
        allDay: true,
        location: 'Sports hall',
      }),
      event({
        id: 'robotics-soldering',
        title: 'Soldering workshop',
        start: at({ days: 8, hours: 16 }),
        end: at({ days: 8, hours: 18 }),
        location: 'Makerspace',
      }),
      event({
        id: 'robotics-board-dinner',
        title: 'Board dinner',
        start: at({ days: 3, hours: 18 }),
        end: at({ days: 3, hours: 20 }),
        private: true,
      }),
      event({
        id: 'robotics-demo-day',
        title: 'Demo day',
        start: at({ days: 4, hours: 15 }),
        end: at({ days: 4, hours: 17 }),
        cancelled: true,
      }),
    ],
    series: [
      weekly({
        id: 'robotics-club-meeting',
        title: 'Club meeting',
        start: at({ days: 2 - CLUB_HISTORY_WEEKS * DAYS_PER_WEEK, hours: 17 }),
        end: at({ days: 2 - CLUB_HISTORY_WEEKS * DAYS_PER_WEEK, hours: 18 }),
        location: 'Room 4.12',
        cancelledDates: [date({ days: 2 + DAYS_PER_WEEK })],
      }),
    ],
  }
}

function departmentSeminar({ at }: Clock): FixtureCalendar {
  return {
    id: 'calendar-seminar',
    name: 'Department seminar',
    isDefault: false,
    events: [
      event({
        id: 'seminar-all-hands',
        title: 'Department all-hands',
        start: at({ days: 4, hours: 14 }),
        end: at({ days: 4, hours: 15 }),
        iCalUId: 'all-hands-ical',
      }),
    ],
    series: [
      weekly({
        id: 'seminar-optics',
        title: 'Optics talk',
        start: at({ days: 1 - SEMINAR_HISTORY_WEEKS * DAYS_PER_WEEK, hours: 9, minutes: 30 }),
        end: at({ days: 1 - SEMINAR_HISTORY_WEEKS * DAYS_PER_WEEK, hours: 10, minutes: 30 }),
        location: 'Lecture hall B',
        interval: 2,
      }),
    ],
  }
}

function choir({ at, date }: Clock): FixtureCalendar {
  return {
    id: 'calendar-choir',
    name: 'Choir',
    isDefault: false,
    events: [
      event({
        id: 'choir-winter-concert',
        title: 'Winter concert',
        start: at({ days: CONCERT_WEEKS_AHEAD * DAYS_PER_WEEK, hours: 18 }),
        end: at({ days: CONCERT_WEEKS_AHEAD * DAYS_PER_WEEK, hours: 20 }),
        location: "St Mary's Church",
      }),
    ],
    series: [
      weekly({
        id: 'choir-rehearsal',
        title: 'Rehearsal',
        start: at({ days: 2 - CHOIR_HISTORY_WEEKS * DAYS_PER_WEEK, hours: 19 }),
        end: at({ days: 2 - CHOIR_HISTORY_WEEKS * DAYS_PER_WEEK, hours: 21 }),
        endDate: date({ days: CHOIR_SEASON_WEEKS * DAYS_PER_WEEK }),
      }),
    ],
  }
}

/**
 * The demo calendars, with times relative to `now`. The main calendar comes first;
 * among the others: a single event next week with a location, a weekly series with one
 * cancelled date, an all-day Saturday event, an event that is in the main calendar too
 * (same iCalUId), a private one and a cancelled one.
 */
function createCalendarFixtures(now: Date = new Date()): FixtureCalendar[] {
  const clock = clockAt(now)
  return [mainCalendar(clock), roboticsClub(clock), departmentSeminar(clock), choir(clock)]
}

export default createCalendarFixtures
