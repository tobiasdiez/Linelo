import fixtureAccount from '#shared/data/fixture-account'
import week from '~/utils/week'

/*
 * Calendar data for stories and tests, at fixed times: the week of Monday 16 November
 * 2026, seen on Tuesday morning in Berlin.
 */

/** Tuesday 17 November 2026, 09:30 in Berlin. */
const STORY_NOW = new Date('2026-11-17T08:30:00Z')
const STORY_TIME_ZONE = 'Europe/Berlin'
const STORY_MONDAY = '2026-11-16'
const STORY_TODAY = '2026-11-17'

const sources = {
  robotics: { id: '6f1c0000-0000-4000-8000-000000000001', name: 'Robotics Club' },
  seminar: { id: '6f1c0000-0000-4000-8000-000000000002', name: 'Department seminar' },
  choir: { id: '6f1c0000-0000-4000-8000-000000000003', name: 'Choir' },
}

type Source = (typeof sources)[keyof typeof sources]

function event(
  overrides: Partial<Calendar.CalendarEvent> & Pick<Calendar.Event, 'id' | 'title'>,
): Calendar.CalendarEvent {
  return {
    iCalUId: `${overrides.id}-ical`,
    start: '2026-11-19T17:00:00Z',
    end: '2026-11-19T19:00:00Z',
    allDay: false,
    cancelled: false,
    private: false,
    exception: false,
    version: 'v1',
    webLink: `https://outlook.office.com/calendar/item/${overrides.id}`,
    ...overrides,
  }
}

function suggestion({
  source,
  overlaps = false,
  summary,
  ...fields
}: Partial<Calendar.Event> &
  Pick<Calendar.Event, 'id' | 'title'> & {
    source: Source
    overlaps?: boolean
    /** Makes it a series: one suggestion for the whole series. */
    summary?: string
  }): Calendar.Suggestion {
  const { webLink: _link, ...shown } = event(fields)
  const eventId = summary ? `${fields.id}-series` : fields.id
  return {
    key: `${source.id}:${eventId}`,
    sourceId: source.id,
    eventId,
    source: { name: source.name },
    event: summary ? { ...shown, seriesMasterId: eventId } : shown,
    ...(summary ? { series: { summary } } : {}),
    overlaps,
  }
}

const lena = event({
  id: 'lena',
  title: '1:1 with Lena',
  start: '2026-11-16T08:00:00Z',
  end: '2026-11-16T08:30:00Z',
})
const focusBlock = event({
  id: 'focus',
  title: 'Focus block',
  start: '2026-11-16T12:00:00Z',
  end: '2026-11-16T13:00:00Z',
})
const vendorReview = event({
  id: 'vendor',
  title: 'Vendor review call',
  start: '2026-11-17T13:00:00Z',
  end: '2026-11-17T14:00:00Z',
  location: 'Teams',
})
const planning = event({
  id: 'planning',
  title: 'Quarterly planning',
  start: '2026-11-18',
  end: '2026-11-19',
  allDay: true,
})
const weeklySync = event({
  id: 'weekly-sync',
  title: 'Weekly sync',
  start: '2026-11-19T09:00:00Z',
  end: '2026-11-19T10:00:00Z',
  source: { name: sources.robotics.name },
})

const rehearsal = suggestion({
  id: 'rehearsal',
  title: 'Rehearsal',
  source: sources.choir,
  start: '2026-11-18T18:00:00Z',
  end: '2026-11-18T20:00:00Z',
  summary: 'Every week on Wednesday',
})
const opticsTalk = suggestion({
  id: 'optics',
  title: 'Optics talk',
  source: sources.seminar,
  start: '2026-11-19T09:30:00Z',
  end: '2026-11-19T10:30:00Z',
  location: 'Lecture hall B',
  summary: 'Every 2 weeks on Thursday',
  overlaps: true,
})
const buildNight = suggestion({
  id: 'build-night',
  title: 'Build night',
  source: sources.robotics,
  start: '2026-11-19T17:00:00Z',
  end: '2026-11-19T19:00:00Z',
  location: 'Lab 2',
})

/** Offsite from Friday 09:00 to Sunday 16:00: an event on three days. */
const offsite = event({
  id: 'offsite',
  title: 'Team offsite',
  start: '2026-11-20T08:00:00Z',
  end: '2026-11-22T15:00:00Z',
  location: 'Lisbon',
})

/** The story week: own events, a copy, and suggestions (a series, one that overlaps); Friday to Sunday free. */
function storyWeek(overrides: Partial<Calendar.WeekResponse> = {}): Calendar.WeekResponse {
  return {
    events: [lena, focusBlock, vendorReview, planning, weeklySync],
    suggestions: [rehearsal, opticsTalk, buildNight],
    moreLater: true,
    unreachable: [],
    sourceCount: 3,
    ...overrides,
  }
}

/** The copy `POST /api/calendar/decisions` answers for an accepted single event. */
function copyOf(accepted: Calendar.Suggestion): Calendar.CalendarEvent {
  return {
    ...accepted.event,
    id: `copy-${accepted.eventId}`,
    iCalUId: `copy-${accepted.eventId}`,
    webLink: `https://outlook.office.com/calendar/item/copy-${accepted.eventId}`,
    source: accepted.source,
  }
}

/** The picker's listing: the main calendar, Robotics Club chosen, the others not. */
function calendarsListing(
  overrides: Partial<Calendar.CalendarsResponse> = {},
): Calendar.CalendarsResponse {
  return {
    account: { id: fixtureAccount.id, address: fixtureAccount.address },
    calendars: [
      { kind: 'outlook', externalId: 'calendar-main', name: 'Calendar', main: true },
      {
        kind: 'outlook',
        externalId: 'calendar-robotics',
        name: 'Robotics Club',
        main: false,
        sourceId: sources.robotics.id,
      },
      { kind: 'outlook', externalId: 'calendar-seminar', name: 'Department seminar', main: false },
      { kind: 'outlook', externalId: 'calendar-choir', name: 'Choir', main: false },
    ],
    ...overrides,
  }
}

/** Builders for calendar data, shared by stories and tests. */
const calendarBuilders = {
  now: STORY_NOW,
  timeZone: STORY_TIME_ZONE,
  monday: STORY_MONDAY,
  today: STORY_TODAY,
  sources,
  event,
  suggestion,
  storyWeek,
  copyOf,
  calendarsListing,
  /** The instants a week spans in the story zone: what the page asks the week API for. */
  instantsOf: (monday: string) => week.instants(monday, STORY_TIME_ZONE),
  stories: {
    lena,
    focusBlock,
    vendorReview,
    planning,
    weeklySync,
    offsite,
    rehearsal,
    opticsTalk,
    buildNight,
  },
}

export default calendarBuilders
