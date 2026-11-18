import type { ComputedRef } from 'vue'
import isConsentError from '~/utils/is-consent-error'
import stateKeys from '~/data/state-keys'

interface CalendarSources {
  /** Whether the picker is open. */
  open: ComputedRef<boolean>
  listing: ComputedRef<Calendar.CalendarsResponse | undefined>
  status: ComputedRef<CalendarView.Status>
  /** Choices still being saved, by calendar: the picker shows them as made. */
  choices: ComputedRef<Readonly<Record<string, boolean>>>
  /** Goes up with every change of the sources, so the calendar page fetches the week again. */
  revision: ComputedRef<number>
  /** Opens the picker and fetches the calendars, so names and shares are current; `returnFocus` puts focus back once it closes. */
  openPicker: (returnFocus: () => void) => void
  closePicker: () => void
  /** Puts focus back after the picker closed (`returnFocus` of `openPicker`). */
  restoreFocus: () => void
  /** Fetches the account's calendars for the picker. */
  load: () => Promise<void>
  /** Makes the calendar a source, or stops suggesting from it; a failure says so in a toast. */
  choose: (calendar: Calendar.ListedCalendar, chosen: boolean) => Promise<void>
}

/** The calendar as a source (with its id), or as none. */
function asSource(
  calendar: Calendar.ListedCalendar,
  sourceId: string | undefined,
): Calendar.ListedCalendar {
  const { sourceId: _previous, ...rest } = calendar
  return sourceId ? { ...rest, sourceId } : rest
}

// Client only: where focus goes when the picker closes, set by whoever opened it
const focus: { restore?: () => void } = {}

function restoreFocus(): void {
  focus.restore?.()
  focus.restore = undefined
}

/** The picker: whether it is open, the account's calendars, and which ones Linelo suggests from. */
function useCalendarSources(): CalendarSources {
  const open = useState(stateKeys.calendarPickerOpen, () => false)
  const listing = useState<Calendar.CalendarsResponse | undefined>(
    stateKeys.calendarListing,
    () => undefined,
  )
  const status = useState<CalendarView.Status>(stateKeys.calendarListingStatus, () => 'idle')
  const choices = useState<Record<string, boolean>>(stateKeys.calendarPickerChoices, () => ({}))
  const revision = useState(stateKeys.calendarSourcesRevision, () => 0)
  const { leaveIfSignedOut } = useSignInRedirect()
  const toast = useToast()

  async function load(): Promise<void> {
    // Shown again while it loads, so reopening does not flash skeletons
    if (!listing.value) {
      status.value = 'loading'
    }
    try {
      listing.value = await $fetch<Calendar.CalendarsResponse>('/api/calendars')
      status.value = 'ready'
    } catch (error) {
      if (await leaveIfSignedOut(error)) {
        return
      }
      if (isConsentError(error)) {
        status.value = 'consent'
        return
      }
      console.error('Loading the calendars failed', error)
      // A listing from before stays: names may be stale, choices still work
      status.value = listing.value ? 'ready' : 'failed'
    }
  }

  function withSource(externalId: string, sourceId: string | undefined): void {
    const current = listing.value
    if (!current) {
      return
    }
    listing.value = {
      ...current,
      calendars: current.calendars.map(calendar =>
        calendar.externalId === externalId ? asSource(calendar, sourceId) : calendar,
      ),
    }
  }

  function openPicker(returnFocus: () => void): void {
    focus.restore = returnFocus
    open.value = true
    void load()
  }

  function closePicker(): void {
    open.value = false
  }

  async function save(calendar: Calendar.ListedCalendar, chosen: boolean): Promise<void> {
    if (chosen) {
      const body: Calendar.SourceRequest = { kind: calendar.kind, externalId: calendar.externalId }
      const added = await $fetch<Calendar.SourceResponse>('/api/calendars/sources', {
        method: 'POST',
        body,
      })
      withSource(calendar.externalId, added.id)
    } else if (calendar.sourceId) {
      await $fetch(`/api/calendars/sources/${encodeURIComponent(calendar.sourceId)}`, {
        method: 'DELETE',
      })
      withSource(calendar.externalId, undefined)
    }
  }

  async function choose(calendar: Calendar.ListedCalendar, chosen: boolean): Promise<void> {
    choices.value = { ...choices.value, [calendar.externalId]: chosen }
    try {
      await save(calendar, chosen)
      revision.value += 1
    } catch (error) {
      if (!(await leaveIfSignedOut(error))) {
        console.error('Changing the calendar sources failed', error)
        toast.add({
          title: "Couldn't change your calendars. Try again.",
          color: 'error',
          icon: 'i-lucide-circle-alert',
        })
      }
    } finally {
      const { [calendar.externalId]: _done, ...rest } = choices.value
      choices.value = rest
    }
  }

  return {
    open: computed(() => open.value),
    listing: computed(() => listing.value),
    status: computed(() => status.value),
    choices: computed(() => choices.value),
    revision: computed(() => revision.value),
    openPicker,
    closePicker,
    restoreFocus,
    load,
    choose,
  }
}

export default useCalendarSources
