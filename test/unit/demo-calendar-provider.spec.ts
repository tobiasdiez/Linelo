import { describe, expect, it } from 'vite-plus/test'
import createDemoCalendarProvider from '#server/calendar/providers/demo'

// A Monday; the demo calendars are relative to it
const NOW = new Date('2026-11-16T09:00:00Z')
const TWO_WEEKS = { from: '2026-11-16T00:00:00Z', to: '2026-11-30T00:00:00Z' }

function connection(id: string): Mail.Connection {
  return {
    account: { id, address: { name: 'Mara Lindqvist', email: 'mara.lindqvist@northwind.co' } },
    accessToken: () => Promise.reject(new Error('The demo calendars need no token')),
  }
}

/** The ids of the events that are the all-hands meeting. */
function allHands(events: Calendar.Event[]): string[] {
  return events.filter(event => event.iCalUId === 'all-hands-ical').map(event => event.id)
}

function provider() {
  return createDemoCalendarProvider({ now: () => NOW })
}

const content: Calendar.EventContent = {
  subject: 'Build night',
  body: { contentType: 'text', content: 'Pizza from 18:30.' },
  start: { dateTime: '2026-11-17T17:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-11-17T19:00:00', timeZone: 'UTC' },
  isAllDay: false,
  location: 'Lab 2',
}

const weekly: Calendar.EventContent = {
  subject: 'Club meeting',
  body: { contentType: 'text', content: '' },
  start: { dateTime: '2026-11-18T17:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-11-18T18:00:00', timeZone: 'UTC' },
  isAllDay: false,
  recurrence: {
    pattern: { type: 'weekly', interval: 1, daysOfWeek: ['wednesday'] },
    range: { type: 'noEnd', startDate: '2026-11-18', recurrenceTimeZone: 'UTC' },
  },
}

describe('demo calendars', () => {
  it('lists the main calendar and three others', async () => {
    expect.hasAssertions()

    const calendars = await provider().listCalendars(connection('mara'))

    expect(calendars.map(({ name, isDefault }) => [name, isDefault])).toStrictEqual([
      ['Calendar', true],
      ['Robotics Club', false],
      ['Department seminar', false],
      ['Choir', false],
    ])
  })

  it('serves the events of a calendar, with series expanded into their occurrences', async () => {
    expect.hasAssertions()

    const events = await provider()
      .reader(connection('mara'), 'calendar-robotics')
      .listEvents(TWO_WEEKS)

    expect(events.map(event => [event.title, event.start])).toStrictEqual([
      ['Build night', '2026-11-17T17:00:00Z'],
      ['Club meeting', '2026-11-18T17:00:00Z'],
      ['Board dinner', '2026-11-19T18:00:00Z'],
      ['Demo day', '2026-11-20T15:00:00Z'],
      ['Robot competition', '2026-11-21'],
      ['Soldering workshop', '2026-11-24T16:00:00Z'],
    ])
    // The occurrence of 25 November is cancelled in the source
    expect(events.find(event => event.title === 'Club meeting')).toMatchObject({
      id: 'robotics-club-meeting-2026-11-18',
      seriesMasterId: 'robotics-club-meeting',
    })
    expect(events.find(event => event.title === 'Board dinner')).toMatchObject({ private: true })
    expect(events.find(event => event.title === 'Demo day')).toMatchObject({ cancelled: true })
  })

  it('shares one meeting between the main calendar and a source', async () => {
    expect.hasAssertions()
    const demo = provider()

    const [main, seminar] = await Promise.all([
      demo.listMainEvents(connection('mara'), TWO_WEEKS),
      demo.reader(connection('mara'), 'calendar-seminar').listEvents(TWO_WEEKS),
    ])

    expect(allHands(main)).toStrictEqual(['main-all-hands'])
    expect(allHands(seminar)).toStrictEqual(['seminar-all-hands'])
  })

  it('describes a series and copies it from its next occurrence', async () => {
    expect.hasAssertions()
    const reader = provider().reader(connection('mara'), 'calendar-robotics')

    const [series] = await reader.getSeries(['robotics-club-meeting', 'unknown'])
    const [withContent] = await reader.getSeriesContent(['robotics-club-meeting'])
    const [master] = await reader.getEvents(['robotics-club-meeting'])

    expect(series).toMatchObject({
      summary: 'Every week on Wednesday',
      cancelledDates: ['2026-11-25'],
      recurrenceTimeZone: 'UTC',
    })
    expect(withContent?.content).toMatchObject({
      start: { dateTime: '2026-11-18T17:00:00', timeZone: 'UTC' },
      recurrence: { range: { startDate: '2026-11-18' } },
    })
    expect(master).toMatchObject({ id: 'robotics-club-meeting', seriesMaster: true })
    expect(master).not.toHaveProperty('seriesMasterId')
  })

  it('reads single events with the content of a copy, and says which are gone', async () => {
    expect.hasAssertions()
    const reader = provider().reader(connection('mara'), 'calendar-robotics')

    const found = await reader.getEvents(['robotics-build-night', 'nothing-here'])

    expect(found).toStrictEqual([
      expect.objectContaining({
        id: 'robotics-build-night',
        seriesMaster: false,
        content: expect.objectContaining({
          subject: 'Build night',
          start: { dateTime: '2026-11-17T17:00:00', timeZone: 'UTC' },
          location: 'Lab 2',
        }),
      }),
      { id: 'nothing-here', gone: true },
    ])
  })

  it('fails to read a calendar it does not have', async () => {
    expect.hasAssertions()

    await expect(
      provider().reader(connection('mara'), 'calendar-gone').listEvents(TWO_WEEKS),
    ).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('keeps copies per account, and makes one copy for a retried transaction', async () => {
    expect.hasAssertions()
    const demo = provider()

    const first = await demo.createEvent(connection('mara'), content, 'decision-1')
    const retried = await demo.createEvent(connection('mara'), content, 'decision-1')
    const mine = await demo.listMainEvents(connection('mara'), TWO_WEEKS)
    const other = await demo.listMainEvents(connection('other'), TWO_WEEKS)

    expect(retried.id).toBe(first.id)
    expect(mine.filter(event => event.title === 'Build night')).toHaveLength(1)
    expect(other.filter(event => event.title === 'Build night')).toStrictEqual([])
    await expect(demo.getMainEvents(connection('mara'), [first.id, 'gone'])).resolves.toStrictEqual(
      [
        expect.objectContaining({ id: first.id, title: 'Build night', location: 'Lab 2' }),
        { id: 'gone', gone: true },
      ],
    )
  })

  it('expands a series copy weekly, and deletes one occurrence of it', async () => {
    expect.hasAssertions()
    const demo = provider()
    const mara = connection('mara')
    const copy = await demo.createEvent(mara, weekly, 'decision-series')

    const occurrence = await demo.findOccurrence(mara, {
      seriesId: copy.id,
      date: '2026-11-25',
      timeZone: 'UTC',
    })
    await demo.deleteEvent(mara, occurrence ?? '')
    const events = await demo.listMainEvents(mara, TWO_WEEKS)

    expect(occurrence).toBe(`${copy.id}-2026-11-25`)
    expect(
      events.filter(event => event.seriesMasterId === copy.id).map(event => event.start),
    ).toStrictEqual(['2026-11-18T17:00:00Z'])
    await expect(
      demo.findOccurrence(mara, { seriesId: copy.id, date: '2026-11-25', timeZone: 'UTC' }),
    ).resolves.toBeUndefined()
  })

  it('updates a copy with a new version and deletes it', async () => {
    expect.hasAssertions()
    const demo = provider()
    const mara = connection('mara')
    const copy = await demo.createEvent(mara, content, 'decision-2')

    const updated = await demo.updateEvent(mara, copy.id, { subject: 'Build night (moved)' })
    const [read] = await demo.getMainEvents(mara, [copy.id])
    await demo.deleteEvent(mara, copy.id)

    expect(updated.version).not.toBe(copy.version)
    expect(read).toMatchObject({ title: 'Build night (moved)', version: updated.version })
    await expect(demo.getMainEvents(mara, [copy.id])).resolves.toStrictEqual([
      { id: copy.id, gone: true },
    ])
    await expect(demo.updateEvent(mara, 'unknown', {})).rejects.toMatchObject({
      kind: 'unavailable',
    })
  })

  it('forgets every copy on reset', async () => {
    expect.hasAssertions()
    const demo = provider()
    const copy = await demo.createEvent(connection('mara'), content, 'decision-3')

    demo.reset()

    await expect(demo.getMainEvents(connection('mara'), [copy.id])).resolves.toStrictEqual([
      { id: copy.id, gone: true },
    ])
  })
})
