<script setup lang="ts">
import CalendarNotice from './CalendarNotice.vue'
import SuggestionBar from './SuggestionBar.vue'
import WeekFooter from './WeekFooter.vue'
import WeekHeader from './WeekHeader.vue'
import WeekList from './WeekList.vue'
import calendarDecisionActions from '~/data/calendar-decision-actions'

type Move = 'previous' | 'next' | 'today'

const {
  monday = undefined,
  current = false,
  timeZone = undefined,
  today = undefined,
  loading = false,
  answer = undefined,
  activeKey = undefined,
  busy = false,
  pending = undefined,
  retrying = false,
  announcement = '',
} = defineProps<{
  /** The Monday of the week; unknown until the browser chose it. */
  monday?: string
  /** The week of today. */
  current?: boolean
  /** The viewer's zone; unknown while rendering on the server. */
  timeZone?: string
  /** Today's date in the zone. */
  today?: string
  /** The week is being fetched: skeletons under the day headings. */
  loading?: boolean
  answer?: Calendar.WeekResponse
  activeKey?: string
  /** A decision is being carried out. */
  busy?: boolean
  /** The decision being carried out, once the wait is noticeable. */
  pending?: Calendar.DecisionVerb
  /** True while fetching the week again, for the other calendars. */
  retrying?: boolean
  /** Said to screen readers once the week is there, such as the week a button moved to. */
  announcement?: string
}>()

const emit = defineEmits<{
  /** To another week; `key` for a shortcut, which moves focus to the range. */
  move: [move: Move, how: 'button' | 'key']
  activate: [key: string]
  decide: [decision: Calendar.DecisionVerb]
  /** Opens the picker. */
  choose: []
  /** Fetches the week again, for the other calendars. */
  retry: []
}>()

const root = useTemplateRef<HTMLElement>('root')
const header = useTemplateRef<InstanceType<typeof WeekHeader>>('header')

const ready = computed(() => (loading ? undefined : answer))
const active = computed(() => ready.value?.suggestions.find(entry => entry.key === activeKey))
const status = computed(() => (loading ? 'Loading your week' : announcement))

const notice = computed<CalendarView.Notice>(() => {
  const shown = ready.value
  if (!shown) {
    return { kind: 'none' }
  }
  if (shown.sourceCount === 0) {
    return { kind: 'choose' }
  }
  if (shown.unreachable.length >= shown.sourceCount) {
    return { kind: 'all-unreachable' }
  }
  if (shown.unreachable.length > 0) {
    return { kind: 'unreachable', names: shown.unreachable }
  }
  return shown.suggestions.length === 0 && !shown.moreLater
    ? { kind: 'nothing-new' }
    : { kind: 'none' }
})

function decide(decision: Calendar.DecisionVerb): void {
  if (active.value && !busy) {
    emit('decide', decision)
  }
}

function move(direction: Move, how: 'button' | 'key'): void {
  if (monday) {
    emit('move', direction, how)
  }
}

/**
 * The keys, as the buttons name them in `aria-keyshortcuts`; `shortcut` keeps them inert
 * while the picker or a menu is open, and text fields are ignored anyway.
 */
const keys: [string, () => void][] = [
  ...calendarDecisionActions.map((action): [string, () => void] => [
    action.key,
    () => decide(action.verb),
  ]),
  ['arrowleft', () => move('previous', 'key')],
  ['arrowright', () => move('next', 'key')],
]
defineShortcuts(Object.fromEntries(keys.map(([key, handler]) => [key, shortcut(handler)])))

/** Focuses the range: after a week change by key, or when the week has no suggestion left. */
function focusHeading(): void {
  header.value?.focus()
}

/** Focuses the suggestion's row, or the range when the week does not show it. */
function focusSuggestion(key: string | undefined): void {
  const row =
    key === undefined
      ? undefined
      : root.value?.querySelector<HTMLElement>(`[data-suggestion-key="${CSS.escape(key)}"]`)
  if (row) {
    row.focus()
  } else {
    focusHeading()
  }
}

defineExpose({ focusHeading, focusSuggestion })
</script>

<template>
  <!-- One column, as the inbox's reading column; room below `lg` for the bar fixed to the bottom -->
  <div ref="root" class="mx-auto w-full max-w-3xl px-6 pt-4 pb-40 lg:px-10 lg:pb-16">
    <WeekHeader
      ref="header"
      :monday="monday"
      :current="current"
      @previous="move('previous', 'button')"
      @next="move('next', 'button')"
      @today="move('today', 'button')"
    />
    <p role="status" class="sr-only">{{ status }}</p>
    <CalendarNotice
      :notice="notice"
      :busy="retrying"
      @choose="emit('choose')"
      @retry="emit('retry')"
    />
    <WeekList
      class="mt-6"
      :class="{ 'motion-safe:animate-fade-in': ready }"
      :monday="monday"
      :events="ready?.events"
      :suggestions="ready?.suggestions"
      :time-zone="timeZone"
      :today="today"
      :active-key="activeKey"
      :loading="!ready"
      :busy="busy"
      :pending="pending"
      @activate="emit('activate', $event)"
      @decide="emit('decide', $event)"
    />
    <WeekFooter v-if="ready?.moreLater" class="mt-8" />
    <!-- Below `lg` only, fixed to the bottom, so the decision stays in reach -->
    <SuggestionBar
      v-if="timeZone"
      class="fixed inset-x-0 bottom-0 z-10 lg:hidden"
      :suggestion="active"
      :time-zone="timeZone"
      :busy="busy"
      :pending="pending"
      @decide="decide"
    />
  </div>
</template>
