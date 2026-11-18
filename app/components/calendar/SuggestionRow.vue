<script setup lang="ts">
import DecisionButtons from './DecisionButtons.vue'
import formatEventTime from '~/utils/format-event-time'

const {
  suggestion,
  day,
  timeZone,
  active = false,
  busy = false,
  pending = undefined,
} = defineProps<{
  suggestion: Calendar.Suggestion
  /** The day the row is shown on, for events that started before it. */
  day: string
  timeZone: string
  /** The suggestion `A` and `N` act on: it carries the buttons (from `lg` on). */
  active?: boolean
  /** A decision is being carried out: the buttons stay focusable, but do nothing. */
  busy?: boolean
  /** The decision being carried out, shown with a spinner. */
  pending?: Calendar.DecisionVerb
}>()

const emit = defineEmits<{
  activate: []
  decide: [decision: Calendar.DecisionVerb]
}>()

const time = computed(() => formatEventTime.timeRange(suggestion.event, { timeZone, day }))
/** The pattern before the source, so cutting the line takes the source first. */
const details = computed(() =>
  [formatEventTime.pattern(suggestion.series), suggestion.source.name].filter(Boolean).join(' · '),
)
</script>

<template>
  <!-- One line, active or not; the dashed edge and muted text mark a suggestion, the solid edge the active one -->
  <li
    class="flex min-h-9 items-center gap-3 border-l-2 py-0.5 pl-2.5 max-lg:min-h-11"
    :class="active ? 'border-solid border-primary-800' : 'border-dashed border-primary-700'"
  >
    <!-- The whole row makes the suggestion active; its name is the source, time and title -->
    <button
      type="button"
      :data-suggestion-key="suggestion.key"
      :aria-current="active ? 'true' : undefined"
      class="grid min-w-0 flex-1 grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-4 rounded-md py-1 text-left focus-visible:focus-ring sm:grid-cols-[8rem_minmax(0,1fr)]"
      :class="active ? 'cursor-default' : 'hover:bg-elevated/60'"
      @click="emit('activate')"
    >
      <span class="sr-only">Suggested from {{ suggestion.source.name }}:</span>
      <time
        :datetime="suggestion.event.start"
        class="text-sm tabular-nums"
        :class="active ? 'text-toned' : 'text-muted'"
      >
        {{ time }}
      </time>
      <span class="flex min-w-0 items-center gap-1.5 text-sm">
        <span class="truncate" :title="`${suggestion.event.title} · ${details}`">
          <span :class="active ? 'font-medium text-highlighted' : 'text-muted'">
            {{ suggestion.event.title }}
          </span>
          <span class="text-muted"> · {{ details }}</span>
        </span>
        <!-- Below `lg` the title keeps the room; the hidden text still says it -->
        <span v-if="suggestion.overlaps" class="sr-only"
          >overlaps with an event in your calendar</span
        >
        <UBadge
          v-if="suggestion.overlaps"
          color="neutral"
          variant="subtle"
          class="shrink-0 normal-case max-lg:hidden"
          aria-hidden="true"
          label="overlaps"
        />
      </span>
    </button>
    <!-- Below `lg`, the bar at the bottom carries the buttons -->
    <DecisionButtons
      v-if="active"
      class="shrink-0 max-lg:hidden"
      :title="suggestion.event.title"
      :busy="busy"
      :pending="pending"
      @decide="emit('decide', $event)"
    />
  </li>
</template>
