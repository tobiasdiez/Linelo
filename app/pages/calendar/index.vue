<script setup lang="ts">
import CalendarConnect from '~/components/calendar/CalendarConnect.vue'
import CalendarScreen from '~/components/calendar/CalendarScreen.vue'
import CalendarStatus from '~/components/calendar/CalendarStatus.vue'
import calendarClock from '~/utils/calendar-clock'
import calendarTime from '#shared/utils/calendar-time'
import keepOnOutsideEscape from '~/utils/keep-on-outside-escape'
import microsoftSignIn from '~/utils/microsoft-sign-in'
import signInNotice from '~/utils/sign-in-notice'
import week from '~/utils/week'

type ToastOptions = Parameters<ReturnType<typeof useToast>['add']>[0]

useHead({ title: 'Calendar · Linelo' })

// Longer than other toasts: Undo is the only way back from an instant decision
const UNDO_TOAST_DURATION = 8000
/** Waits shorter than this show no spinner, so quick answers do not flicker. */
const PENDING_DELAY_MS = 300
const errorIcon = 'i-lucide-circle-alert'

const route = useRoute()
const calendar = useCalendar()
const sources = useCalendarSources()
const toast = useToast()
const screen = useTemplateRef<InstanceType<typeof CalendarScreen>>('screen')

/*
 * The week, Today and the day an event belongs to depend on the viewer's time zone,
 * which the server does not know: the week renders once the browser knows it.
 */
const viewer = shallowRef<{ timeZone: string; today: string; monday: string }>()
const retrying = ref(false)
const connecting = ref(false)
const connectFailed = ref(false)
/** The decision in flight, once the wait is noticeable. */
const pending = ref<Calendar.DecisionVerb>()
/** The week a button moved to, said once it is there. */
const announcement = ref('')

const shownMonday = computed(() => (viewer.value ? calendar.monday.value : undefined))

const connectNotice = computed<Session.ConnectNotice | undefined>(() => {
  if (connectFailed.value) {
    return 'failed'
  }
  if (!route.query.error) {
    return undefined
  }
  return signInNotice(route.query) === 'cancelled' ? 'cancelled' : 'failed'
})

/** The week `?week=` asks for, as its Monday; the current week without one. */
function requestedWeek(): string | undefined {
  return viewer.value && week.parseWeek(route.query.week, viewer.value.monday)
}

/** The query for a week: none for the current one (which also drops a notice from Microsoft). */
function weekQuery(target: string): Record<string, string> {
  return target === viewer.value?.monday ? {} : { week: target }
}

/** Where a move goes, and moves there through the URL (so Back works). */
async function onMove(move: 'previous' | 'next' | 'today', how: 'button' | 'key'): Promise<void> {
  const shown = calendar.monday.value
  if (!shown || !viewer.value) {
    return
  }
  const steps = { previous: -calendarTime.DAYS_PER_WEEK, next: calendarTime.DAYS_PER_WEEK }
  const target = move === 'today' ? viewer.value.monday : week.addDays(shown, steps[move])
  announcement.value = ''
  await navigateTo({ query: weekQuery(target) })
  // A shortcut, and Today (which hides itself), take focus to the range; the arrows keep it
  if (how === 'key' || move === 'today') {
    screen.value?.focusHeading()
  }
  if (how === 'button' && calendar.monday.value === target) {
    announcement.value = week.rangeLabel(target)
  }
}

async function runSync(): Promise<void> {
  const report = await calendar.sync()
  if (!report) {
    return
  }
  for (const removal of report.removed) {
    toast.add({
      title: `Removed from your calendar: ${removal.title}`,
      description: `Cancelled in ${removal.source}.`,
    })
  }
  // The week names its own unreachable sources already
  const named = new Set(calendar.answer.value?.unreachable)
  for (const name of report.unreachable.filter(entry => !named.has(entry))) {
    toast.add({ title: `${name} couldn't be reached. Events you accepted stay.` })
  }
  const shown = calendar.monday.value
  if (shown && (report.updated > 0 || report.removed.length > 0)) {
    await calendar.load(shown, { quiet: true })
  }
}

function onPageShow(event: PageTransitionEvent): void {
  // Back from Microsoft's page restores this one from the browser's cache, still busy
  if (event.persisted) {
    connecting.value = false
  }
}

onMounted(async () => {
  window.addEventListener('pageshow', onPageShow)
  const timeZone = calendarClock.timeZone()
  const today = week.dateIn(calendarClock.now(), timeZone)
  viewer.value = { timeZone, today, monday: week.mondayOf(today) }
  const target = requestedWeek()
  if (!target) {
    return
  }
  const loading = calendar.load(target)
  // `?week=` names the Monday: any other date, or nonsense, is normalised (the week is set already)
  if (route.query.week !== undefined && route.query.week !== target) {
    const { week: _requested, ...rest } = route.query
    await navigateTo({ query: { ...rest, ...weekQuery(target) } }, { replace: true })
  }
  /*
   * The week paints first: the sync waits in the same mailbox queue otherwise. Without
   * calendar access, or with the week failed, it would only fail again.
   */
  await loading
  if (calendar.status.value === 'ready') {
    await runSync()
  }
})

onBeforeUnmount(() => window.removeEventListener('pageshow', onPageShow))

// Back, Forward and the week buttons all go through the URL
watch(
  () => route.query.week,
  async () => {
    const target = requestedWeek()
    if (target && target !== calendar.monday.value) {
      await calendar.load(target)
    }
  },
)

// A change in the picker shows in the week at once
watch(sources.revision, () => {
  const shown = calendar.monday.value
  if (shown) {
    void calendar.load(shown, { quiet: true })
  }
})

function withUndo(decisionId: string, title: string): ToastOptions {
  return {
    title,
    actions: [
      {
        label: 'Undo',
        onClick: () => {
          void onUndo(decisionId)
        },
      },
    ],
    duration: UNDO_TOAST_DURATION,
    onEscapeKeyDown: keepOnOutsideEscape,
  }
}

async function onUndo(decisionId: string): Promise<void> {
  try {
    const suggestion = await calendar.undo(decisionId)
    if (suggestion) {
      await nextTick()
      screen.value?.focusSuggestion(suggestion.key)
    }
  } catch (error) {
    console.error('Undoing the decision failed', error)
    toast.add({ title: "Couldn't undo that.", color: 'error', icon: errorIcon })
  }
}

async function onDecide(decision: Calendar.DecisionVerb): Promise<void> {
  const timer = setTimeout(() => {
    pending.value = decision
  }, PENDING_DELAY_MS)
  try {
    const outcome = await calendar.decide(decision)
    if (!outcome) {
      return
    }
    const done = outcome.response.decision === 'accepted' ? 'Accepted' : 'Not for me'
    toast.add(withUndo(outcome.response.id, `${done}: ${outcome.suggestion.event.title}`))
    await nextTick()
    screen.value?.focusSuggestion(calendar.active.value?.key)
  } catch (error) {
    console.error('Deciding about the suggestion failed', error)
    toast.add({
      title:
        decision === 'accept'
          ? "Couldn't accept this. Try again."
          : "Couldn't save that. Try again.",
      color: 'error',
      icon: errorIcon,
    })
  } finally {
    clearTimeout(timer)
    pending.value = undefined
  }
}

/** Fetches the week again without leaving what is shown: the failed state stays until it worked. */
async function onRetry(): Promise<void> {
  const shown = calendar.monday.value
  if (!shown) {
    return
  }
  retrying.value = true
  try {
    await calendar.load(shown, { quiet: true })
  } finally {
    retrying.value = false
  }
}

/** The callout opens the picker; focus comes back to the active suggestion, or the range. */
function chooseCalendars(): void {
  sources.openPicker(() => screen.value?.focusSuggestion(calendar.active.value?.key))
}

async function allowCalendarAccess(): Promise<void> {
  connecting.value = true
  connectFailed.value = false
  // On success the client leaves for Microsoft, which returns to the callback and then here
  const { error } = await microsoftSignIn
    .start('/calendar')
    .catch((networkError: unknown) => ({ error: networkError }))
  if (!error) {
    return
  }
  console.error('Starting the calendar consent with Microsoft failed', error)
  connectFailed.value = true
  connecting.value = false
}
</script>

<template>
  <div class="min-h-dvh">
    <AppHeader />
    <main>
      <CalendarConnect
        v-if="calendar.status.value === 'consent'"
        :notice="connectNotice"
        :busy="connecting"
        @allow="allowCalendarAccess"
      />
      <CalendarStatus
        v-else-if="calendar.status.value === 'failed'"
        :busy="retrying"
        @retry="onRetry"
      />
      <CalendarScreen
        v-else
        ref="screen"
        :monday="shownMonday"
        :current="shownMonday !== undefined && shownMonday === viewer?.monday"
        :time-zone="viewer?.timeZone"
        :today="viewer?.today"
        :loading="calendar.status.value !== 'ready'"
        :answer="calendar.answer.value"
        :active-key="calendar.active.value?.key"
        :busy="calendar.deciding.value"
        :pending="pending"
        :retrying="retrying"
        :announcement="announcement"
        @move="onMove"
        @activate="calendar.activate"
        @decide="onDecide"
        @choose="chooseCalendars"
        @retry="onRetry"
      />
    </main>
  </div>
</template>
