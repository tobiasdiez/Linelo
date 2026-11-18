<script setup lang="ts">
import formatEventTime from '~/utils/format-event-time'

const { event, day, timeZone } = defineProps<{
  event: Calendar.CalendarEvent
  /** The day the row is shown on: an event over several days has a row on each. */
  day: string
  timeZone: string
}>()

const time = computed(() => formatEventTime.timeRange(event, { timeZone, day }))
const continued = computed(() => formatEventTime.continues(event, { timeZone, day }))
const details = computed(() =>
  [event.location, event.source?.name]
    .filter((entry): entry is string => Boolean(entry))
    .join(' · '),
)
</script>

<template>
  <!-- Same left edge as a suggestion row, transparent, so times line up -->
  <li
    class="grid min-h-9 grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-x-4 border-l-2 border-transparent py-1 pl-2.5 max-lg:min-h-11 sm:grid-cols-[8rem_minmax(0,1fr)_auto]"
  >
    <time :datetime="event.start" class="text-sm text-muted tabular-nums">
      {{ time }}
    </time>
    <p class="min-w-0 text-sm">
      <span class="font-medium text-highlighted">{{ event.title }}</span>
      <span v-if="continued" class="text-muted"> · continued</span>
      <span v-if="details" class="text-muted"> · {{ details }}</span>
    </p>
    <ULink
      v-if="event.webLink"
      :to="event.webLink"
      target="_blank"
      rel="noopener"
      class="rounded-md p-1 text-muted hover:text-highlighted focus-visible:focus-ring"
    >
      <UIcon name="i-lucide-external-link" class="block size-4" />
      <span class="sr-only">Open {{ event.title }} in Outlook (opens in a new tab)</span>
    </ULink>
  </li>
</template>
