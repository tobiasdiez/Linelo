/**
 * The calendar page's view model (`app/utils/week-days.ts`, `app/components/calendar`). Declared
 * globally because the lint setup allows only default exports; in `shared` so the unit tests see it too.
 */
declare namespace CalendarView {
  type Row =
    | { kind: 'event'; key: string; event: Calendar.CalendarEvent }
    | { kind: 'suggestion'; key: string; suggestion: Calendar.Suggestion }

  interface Day {
    kind: 'day'
    date: string
    today: boolean
    rows: Row[]
    /** Sources of the suggestions not shown yet: "more from Choir". */
    moreFrom: string[]
  }

  /** Free days in a row; one day when `from` and `to` are the same. */
  interface FreeRun {
    kind: 'free'
    from: string
    to: string
  }

  type Group = Day | FreeRun

  /**
   * Of the week and of the picker's listing: `idle` before the first load (also while
   * rendering on the server), `loading` while fetched with skeletons, `failed` when the
   * main calendar did not answer, `consent` when Linelo has no calendar access.
   */
  type Status = 'idle' | 'loading' | 'ready' | 'failed' | 'consent'

  /** The line under the week header. */
  type Notice =
    | { kind: 'none' }
    | { kind: 'choose' }
    | { kind: 'nothing-new' }
    | { kind: 'unreachable'; names: readonly string[] }
    | { kind: 'all-unreachable' }
}
