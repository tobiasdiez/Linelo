<script setup lang="ts">
const SKELETON_LINES = 3

const {
  open = false,
  listing = undefined,
  status,
  choices = {},
} = defineProps<{
  open?: boolean
  listing?: Calendar.CalendarsResponse
  status: CalendarView.Status
  /** Choices still being saved, by calendar: shown as made. */
  choices?: Readonly<Record<string, boolean>>
}>()

const emit = defineEmits<{
  /** Done, the close button, Escape or a click outside. */
  close: []
  /** The panel is gone: focus goes back to where the picker was opened from. */
  closed: []
  /** The user ticked or unticked a calendar; applies at once. */
  choose: [calendar: Calendar.ListedCalendar, chosen: boolean]
  retry: []
}>()

/** Reka would focus the body (there is no trigger): the opener says where focus goes instead. */
const content = {
  onCloseAutoFocus: (event: Event) => {
    event.preventDefault()
    emit('closed')
  },
}

function onOpenChange(value: boolean): void {
  if (!value) {
    emit('close')
  }
}

const mainHeadingId = useId()
const othersHeadingId = useId()

const main = computed(() => listing?.calendars.find(calendar => calendar.main))
const others = computed(() => listing?.calendars.filter(calendar => !calendar.main) ?? [])

function isChosen(calendar: Calendar.ListedCalendar): boolean {
  return choices[calendar.externalId] ?? calendar.sourceId !== undefined
}

function choose(calendar: Calendar.ListedCalendar, value: boolean | 'indeterminate'): void {
  emit('choose', calendar, value === true)
}
</script>

<template>
  <USlideover
    :open="open"
    :content="content"
    title="Calendars"
    :description="listing?.account.address.email ?? 'Your Microsoft account'"
    @update:open="onOpenChange"
  >
    <template #body>
      <div v-if="status === 'loading' || status === 'idle'" class="space-y-3" aria-busy="true">
        <USkeleton v-for="line in SKELETON_LINES" :key="line" class="h-5 w-full" />
      </div>
      <div v-else-if="status === 'failed'" class="space-y-3">
        <p class="text-sm text-toned">Couldn't load your calendars.</p>
        <UButton label="Try again" color="primary" variant="soft" @click="emit('retry')" />
      </div>
      <p v-else-if="status === 'consent'" class="text-sm text-toned">
        Linelo doesn't have access to your calendar yet. Open the calendar to allow it.
      </p>
      <div v-else class="space-y-8">
        <section v-if="main" :aria-labelledby="mainHeadingId">
          <h3 :id="mainHeadingId" class="text-2xs font-semibold tracking-wide text-muted uppercase">
            Main calendar
          </h3>
          <p class="mt-2 text-sm font-medium text-highlighted">{{ main.name }}</p>
          <p class="mt-0.5 text-sm text-muted">
            Your account's default calendar. Accepted events go here.
          </p>
        </section>
        <section :aria-labelledby="othersHeadingId">
          <h3
            :id="othersHeadingId"
            class="text-2xs font-semibold tracking-wide text-muted uppercase"
          >
            Other calendars
          </h3>
          <template v-if="others.length > 0">
            <p class="mt-2 text-sm text-muted">
              Linelo suggests their events in your week, one decision each. Nothing is overlaid.
            </p>
            <ul class="mt-3 space-y-2.5">
              <li v-for="calendar in others" :key="calendar.externalId">
                <UCheckbox
                  :model-value="isChosen(calendar)"
                  :label="calendar.name"
                  @update:model-value="choose(calendar, $event)"
                />
              </li>
            </ul>
          </template>
          <p v-else class="mt-2 text-sm text-muted">Your account has no other calendars yet.</p>
          <p class="mt-4 text-sm text-muted">
            Calendars shared with you appear here once you have accepted them in Outlook.
          </p>
        </section>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end">
        <UButton label="Done" color="primary" variant="solid" @click="emit('close')" />
      </div>
    </template>
  </USlideover>
</template>
