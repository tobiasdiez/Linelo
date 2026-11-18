/**
 * Calendar domain types, shared by the server's calendar layer (`server/calendar`) and the app.
 * Everything provider-specific lives behind `Calendar.Provider` and `Calendar.SourceReader`.
 * Declared as a global namespace because the lint setup allows only default exports.
 */
declare namespace Calendar {
  /** How a source is read. Only calendars in the account's own calendar list this round. */
  type SourceKind = 'outlook'

  /** An instant range, `to` exclusive, as ISO 8601 instants. */
  interface Range {
    from: string
    to: string
  }

  /** An event as the app shows it. Instants in UTC; all-day events carry dates. */
  interface Event {
    id: string
    /** Set on the occurrences of a series. */
    seriesMasterId?: string
    /** The same meeting in two calendars has the same one; different for each occurrence of a series. */
    iCalUId: string
    title: string
    /** ISO instant, or `YYYY-MM-DD` when `allDay`. */
    start: string
    /** Exclusive, in the same form as `start`. */
    end: string
    allDay: boolean
    location?: string
    cancelled: boolean
    /** Marked personal, private or confidential. */
    private: boolean
    /** A moved single occurrence of a series. */
    exception: boolean
    /** Changes whenever the event changes (Graph's changeKey); `null` when the provider sent none. */
    version: string | null
    /** Opens the event in Outlook on the web. */
    webLink?: string
    /** The zone the event was created in, for all-day copies. */
    originalTimeZone?: string
  }

  /** What goes into a copy, in the provider's own time representation. */
  interface EventContent {
    subject: string
    body: { contentType: 'html' | 'text'; content: string }
    start: { dateTime: string; timeZone: string }
    end: { dateTime: string; timeZone: string }
    isAllDay: boolean
    location?: string
    /** The provider's recurrence, copied verbatim. */
    recurrence?: unknown
  }

  /** A single event with what a copy of it needs. */
  interface DetailedEvent extends Event {
    /** A series master rather than a single event: copy it through `getSeriesContent`. */
    seriesMaster: boolean
    content: EventContent
  }

  /** An id that the provider no longer knows (404). */
  interface Gone {
    id: string
    gone: true
  }

  /** What a copy is made from: a single event, or a series (through its master). */
  type CopyTarget =
    | { kind: 'single'; event: DetailedEvent }
    | { kind: 'series'; series: SeriesWithContent }

  /** A recurring series, read from its master. */
  interface Series {
    id: string
    version: string | null
    cancelled: boolean
    /** Graph's patternedRecurrence, copied verbatim. */
    recurrence: unknown
    recurrenceTimeZone?: string
    /** "Every week on Monday, until 20 Dec" */
    summary: string
    /** `YYYY-MM-DD`, in the recurrence's zone. */
    cancelledDates: string[]
  }

  /** A series with what a copy needs: subject, body, location, and the next occurrence's local times. */
  interface SeriesWithContent extends Series {
    content: EventContent
  }

  /** Reads one source, whatever its kind. `suggestions.ts` and `sync.ts` see sources only through this. */
  interface SourceReader {
    /** Occurrences and single events in the range. Series occurrences carry `seriesMasterId`. */
    listEvents: (range: Range) => Promise<Event[]>
    /** Series masters by id (batched). Missing ids are left out. */
    getSeries: (ids: readonly string[]) => Promise<Series[]>
    /** Series masters by id with the content of a copy that starts at the next occurrence. Missing ids are left out. */
    getSeriesContent: (ids: readonly string[]) => Promise<SeriesWithContent[]>
    /** Single events, occurrences or series masters by id (batched); `gone` for a 404. */
    getEvents: (ids: readonly string[]) => Promise<(DetailedEvent | Gone)[]>
  }

  /** A calendar of the account, as its provider lists it. */
  interface ProviderCalendar {
    externalId: string
    name: string
    isDefault: boolean
  }

  /** The account's calendar provider: lists its calendars, reads them, and writes the main calendar. */
  interface Provider {
    /** Requested at sign-in on top of the mail scopes. */
    calendarScopes: readonly string[]
    listCalendars: (connection: Mail.Connection) => Promise<ProviderCalendar[]>
    /** A reader for one of the account's calendars (kind `outlook`). */
    reader: (connection: Mail.Connection, calendarId: string) => SourceReader
    /** Events of the main calendar in the range, for the week list and the already-present check. */
    listMainEvents: (connection: Mail.Connection, range: Range) => Promise<Event[]>
    /** Events of the main calendar by id (batched): the copies, to compare and to name them. */
    getMainEvents: (
      connection: Mail.Connection,
      ids: readonly string[],
    ) => Promise<(Event | Gone)[]>
    /**
     * Creates the copy; one copy for a retried `transactionId`. `event` is the copy as the
     * provider stored it, when it answered with times the app can read (in UTC).
     */
    createEvent: (
      connection: Mail.Connection,
      content: EventContent,
      transactionId: string,
    ) => Promise<{ id: string; version: string | null; event?: Event }>
    updateEvent: (
      connection: Mail.Connection,
      eventId: string,
      content: Partial<EventContent>,
    ) => Promise<{ version: string | null }>
    /** A 404 counts as done. */
    deleteEvent: (connection: Mail.Connection, eventId: string) => Promise<void>
    /** The occurrence of a (copied) series on a date in the series' zone, to delete it. */
    findOccurrence: (
      connection: Mail.Connection,
      occurrence: { seriesId: string; date: string; timeZone: string },
    ) => Promise<string | undefined>
  }

  /** A connected account with a calendar adapter. */
  interface Account {
    providerId: string
    provider: Provider
    connection: Mail.Connection
  }

  /**
   * What a calendar module answers a route: a result with its body, or a refusal with a
   * sentence saying what was wrong. `server/calendar/api.ts` turns them into HTTP statuses
   * (`ok` 200, `created` 201, `done` 204; `invalid` 400, `not-found` 404, `conflict` 409).
   * Failed provider calls are thrown.
   */
  type Outcome<Body = undefined> =
    | { result: 'ok' | 'created' | 'done'; body: Body }
    | { refusal: 'invalid' | 'not-found' | 'conflict'; message: string }

  /** An event of the week list; a copy names its source. */
  interface CalendarEvent extends Event {
    source?: { name: string }
  }

  /** An undecided event of a source, shown in place in the week. */
  interface Suggestion {
    /** `<sourceId>:<sourceEventId>`; for a series, its master's id. */
    key: string
    sourceId: string
    /** What a decision names: the event, or for a series its master. */
    eventId: string
    source: { name: string }
    /** For a series, its first occurrence in the range. */
    event: Event
    series?: { summary: string }
    /** One of your own events overlaps it. */
    overlaps: boolean
  }

  /** `GET /api/calendar/week` */
  interface WeekResponse {
    events: CalendarEvent[]
    suggestions: Suggestion[]
    /** An undecided event waits in a later week, within the next 30 days. */
    moreLater: boolean
    /** Names of sources that did not answer; their suggestions are missing. */
    unreachable: string[]
    /** How many other calendars the user chose; never shown, it tells "none chosen" and "none answered" apart. */
    sourceCount: number
  }

  /** A copy that was removed because its source event was cancelled. */
  interface Removal {
    title: string
    source: string
  }

  /** `POST /api/calendar/sync` */
  interface SyncResponse {
    updated: number
    removed: Removal[]
    unreachable: string[]
  }

  /** What the user says about a suggestion, on the wire. */
  type DecisionVerb = 'accept' | 'dismiss'

  /** What is stored about an event: `accept` stores `accepted`, `dismiss` stores `dismissed`. */
  type Decision = 'accepted' | 'dismissed'

  /** `POST /api/calendar/decisions` */
  interface DecisionRequest {
    sourceId: string
    eventId: string
    decision: DecisionVerb
  }

  interface DecisionResponse {
    id: string
    decision: Decision
    /** The copy, for the week list; missing for a series, whose occurrences come with the next week answer. */
    event?: CalendarEvent
  }

  /** A calendar in the picker. */
  interface ListedCalendar {
    kind: SourceKind
    externalId: string
    name: string
    /** The account's default calendar: shown, and where copies go. Not a source. */
    main: boolean
    /** Set when the calendar is a source. */
    sourceId?: string
  }

  /** `GET /api/calendars` */
  interface CalendarsResponse {
    account: { id: string; address: Inbox.Participant }
    calendars: ListedCalendar[]
  }

  /** `POST /api/calendars/sources` */
  interface SourceRequest {
    kind: SourceKind
    externalId: string
  }

  interface SourceResponse {
    id: string
    name: string
  }
}
