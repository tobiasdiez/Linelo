import type { ComputedRef } from 'vue'
import calendarClock from '~/utils/calendar-clock'
import calendarTime from '#shared/utils/calendar-time'
import httpStatus from '#shared/utils/http-status'
import isConsentError from '~/utils/is-consent-error'
import isRecord from '#shared/utils/is-record'
import stateKeys from '~/data/state-keys'
import week from '~/utils/week'

/** A decision made in this session, for Undo and to keep its suggestion out of later week answers. */
interface Resolution {
  key: string
  decisionId: string
  decision: Calendar.Decision
  suggestion: Calendar.Suggestion
  /** The Monday of the week it was decided in. */
  monday: string
  /** The copy, when the answer brought one. */
  copy?: Calendar.CalendarEvent
}

interface DecideOutcome {
  suggestion: Calendar.Suggestion
  response: Calendar.DecisionResponse
}

interface CalendarApi {
  /** The Monday of the week shown, once the browser chose it. */
  monday: ComputedRef<string | undefined>
  /** The week answer, minus what was decided in this session. */
  answer: ComputedRef<Calendar.WeekResponse | undefined>
  status: ComputedRef<CalendarView.Status>
  /** The suggestion `A` and `N` act on. */
  active: ComputedRef<Calendar.Suggestion | undefined>
  /** True while a decision is being carried out. */
  deciding: ComputedRef<boolean>
  /**
   * Fetches the week. `quiet` keeps what is shown (no skeletons, a failed week stays
   * failed) until the answer is there: for refreshes and for trying again.
   */
  load: (monday: string, options?: { quiet?: boolean }) => Promise<void>
  /** Reconciles the copies with their sources; `undefined` when it did not work. */
  sync: () => Promise<Calendar.SyncResponse | undefined>
  /** Makes the suggestion the active one, as the user's choice. */
  activate: (key: string) => void
  /**
   * Decides about the active suggestion. Resolves to `undefined` when there is nothing to
   * report: a decision is in flight, it was decided elsewhere, or the user had to leave
   * for sign-in. Rejects when the decision failed; the suggestion stays.
   */
  decide: (decision: Calendar.DecisionVerb) => Promise<DecideOutcome | undefined>
  /** Takes a decision of this session back; its suggestion returns and becomes active. Rejects when that failed. */
  undo: (decisionId: string) => Promise<Calendar.Suggestion | undefined>
}

function isConflict(error: unknown): boolean {
  return isRecord(error) && error.statusCode === httpStatus.conflict
}

// Client only: the week request whose answer counts, so a slow answer for an earlier week is dropped
const requests = { latest: 0 }

/** The calendar page's state: the week, its suggestions, the active one, and the decisions. */
function useCalendar(): CalendarApi {
  const monday = useState<string | undefined>(stateKeys.calendarWeek, () => undefined)
  const answer = useState<Calendar.WeekResponse | undefined>(
    stateKeys.calendarData,
    () => undefined,
  )
  const status = useState<CalendarView.Status>(stateKeys.calendarStatus, () => 'idle')
  const activeKey = useState<string | undefined>(stateKeys.calendarActiveKey, () => undefined)
  const activeChosen = useState(stateKeys.calendarActiveChosen, () => false)
  const resolved = useState<Resolution[]>(stateKeys.calendarResolved, () => [])
  const deciding = useState(stateKeys.calendarDeciding, () => false)
  const { leaveIfSignedOut } = useSignInRedirect()

  const active = computed(() =>
    answer.value?.suggestions.find(suggestion => suggestion.key === activeKey.value),
  )

  /** The user's pick while it is there; otherwise the first suggestion in time order. */
  function settleActive(): void {
    const list = answer.value?.suggestions ?? []
    if (!activeChosen.value || !list.some(suggestion => suggestion.key === activeKey.value)) {
      activeChosen.value = false
      activeKey.value = list[0]?.key
    }
  }

  function apply(target: string, response: Calendar.WeekResponse): void {
    const decided = new Set(resolved.value.map(entry => entry.key))
    const ids = new Set(response.events.map(event => event.id))
    // Copies made in this session that a slower answer does not know yet
    const copies = resolved.value.flatMap(entry =>
      entry.monday === target && entry.copy && !ids.has(entry.copy.id) ? [entry.copy] : [],
    )
    answer.value = {
      ...response,
      events: calendarTime.byStart([...response.events, ...copies], event => event),
      suggestions: response.suggestions.filter(suggestion => !decided.has(suggestion.key)),
    }
    settleActive()
  }

  /** Whether the failure was handled: signed out, or no calendar access. */
  async function handled(error: unknown): Promise<boolean> {
    if (await leaveIfSignedOut(error)) {
      return true
    }
    if (isConsentError(error)) {
      status.value = 'consent'
      return true
    }
    return false
  }

  async function load(target: string, { quiet = false } = {}): Promise<void> {
    requests.latest += 1
    const request = requests.latest
    if (monday.value !== target) {
      activeChosen.value = false
    }
    monday.value = target
    if (!quiet) {
      status.value = 'loading'
    }
    try {
      const response = await $fetch<Calendar.WeekResponse>('/api/calendar/week', {
        query: week.instants(target, calendarClock.timeZone()),
      })
      if (request !== requests.latest) {
        return
      }
      apply(target, response)
      status.value = 'ready'
    } catch (error) {
      if (request !== requests.latest || (await handled(error))) {
        return
      }
      console.error('Loading the week failed', error)
      // A refresh that fails keeps the week that is shown
      if (status.value !== 'ready') {
        status.value = 'failed'
      }
    }
  }

  async function sync(): Promise<Calendar.SyncResponse | undefined> {
    try {
      return await $fetch<Calendar.SyncResponse>('/api/calendar/sync', { method: 'POST' })
    } catch (error) {
      if (!(await handled(error))) {
        console.error('Syncing the calendar failed', error)
      }
      return undefined
    }
  }

  function activate(key: string): void {
    if (answer.value?.suggestions.some(suggestion => suggestion.key === key)) {
      activeKey.value = key
      activeChosen.value = true
    }
  }

  /** Takes the suggestion out of the week, and makes the next one in time order active. */
  function remove(key: string, copy?: Calendar.CalendarEvent): void {
    const current = answer.value
    if (!current) {
      return
    }
    const index = current.suggestions.findIndex(suggestion => suggestion.key === key)
    const remaining = current.suggestions.filter(suggestion => suggestion.key !== key)
    answer.value = {
      ...current,
      suggestions: remaining,
      events: copy
        ? calendarTime.byStart([...current.events, copy], event => event)
        : current.events,
    }
    if (activeKey.value === key) {
      activeKey.value = (remaining[index] ?? remaining[0])?.key
    }
  }

  async function decide(decision: Calendar.DecisionVerb): Promise<DecideOutcome | undefined> {
    const suggestion = active.value
    const target = monday.value
    if (!suggestion || !target || deciding.value) {
      return undefined
    }
    deciding.value = true
    try {
      const body: Calendar.DecisionRequest = {
        sourceId: suggestion.sourceId,
        eventId: suggestion.eventId,
        decision,
      }
      const response = await $fetch<Calendar.DecisionResponse>('/api/calendar/decisions', {
        method: 'POST',
        body,
      })
      resolved.value = [
        ...resolved.value,
        {
          key: suggestion.key,
          decisionId: response.id,
          decision: response.decision,
          suggestion,
          monday: target,
          ...(response.event ? { copy: response.event } : {}),
        },
      ]
      remove(suggestion.key, response.event)
      if (response.decision === 'accepted' && !response.event) {
        // A series: its copied occurrences come with the week
        void load(target, { quiet: true })
      }
      return { suggestion, response }
    } catch (error) {
      if (isConflict(error)) {
        // Decided in another tab meanwhile, or in the main calendar already
        remove(suggestion.key)
        void load(target, { quiet: true })
        return undefined
      }
      if (await handled(error)) {
        return undefined
      }
      throw error
    } finally {
      deciding.value = false
    }
  }

  async function undo(decisionId: string): Promise<Calendar.Suggestion | undefined> {
    const entry = resolved.value.find(candidate => candidate.decisionId === decisionId)
    if (!entry) {
      return undefined
    }
    try {
      await $fetch(`/api/calendar/decisions/${encodeURIComponent(decisionId)}`, {
        method: 'DELETE',
      })
    } catch (error) {
      if (await leaveIfSignedOut(error)) {
        return undefined
      }
      throw error
    }
    resolved.value = resolved.value.filter(candidate => candidate !== entry)
    const current = answer.value
    if (!current || monday.value !== entry.monday) {
      return entry.suggestion
    }
    answer.value = {
      ...current,
      suggestions: calendarTime.byStart(
        [...current.suggestions, entry.suggestion],
        suggestion => suggestion.event,
      ),
      events: current.events.filter(event => event.id !== entry.copy?.id),
    }
    activeKey.value = entry.key
    activeChosen.value = true
    if (entry.decision === 'accepted' && !entry.copy) {
      // A series: its copied occurrences leave with the week
      void load(entry.monday, { quiet: true })
    }
    return entry.suggestion
  }

  return {
    monday: computed(() => monday.value),
    answer: computed(() => answer.value),
    status: computed(() => status.value),
    active,
    deciding: computed(() => deciding.value),
    load,
    sync,
    activate,
    decide,
    undo,
  }
}

export default useCalendar
