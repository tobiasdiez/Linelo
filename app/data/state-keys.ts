/**
 * The `useState` keys of everything that belongs to the signed-in user. Leaving
 * for sign-in clears all of them (`useSignInRedirect`).
 */
const stateKeys = {
  currentUser: 'current-user',
  /** Whether the server was asked who is signed in, so hydration does not ask again. */
  currentUserChecked: 'current-user-checked',
  inboxQueue: 'inbox-queue',
  inboxQueueStatus: 'inbox-queue-status',
  inboxQueueResolving: 'inbox-queue-resolving',
  /** The Monday of the week the calendar shows. */
  calendarWeek: 'calendar-week',
  calendarData: 'calendar-data',
  calendarStatus: 'calendar-status',
  calendarActiveKey: 'calendar-active-key',
  /** Whether the user picked the active suggestion of this week; otherwise it follows time order. */
  calendarActiveChosen: 'calendar-active-chosen',
  /** Decisions made in this session, for Undo and to keep them out of later week answers. */
  calendarResolved: 'calendar-resolved',
  calendarDeciding: 'calendar-deciding',
  calendarPickerOpen: 'calendar-picker-open',
  /** Choices in the picker still being saved, by calendar. */
  calendarPickerChoices: 'calendar-picker-choices',
  calendarListing: 'calendar-listing',
  calendarListingStatus: 'calendar-listing-status',
  /** Counts changes of the sources, so the calendar page fetches the week again. */
  calendarSourcesRevision: 'calendar-sources-revision',
} as const

export default stateKeys
