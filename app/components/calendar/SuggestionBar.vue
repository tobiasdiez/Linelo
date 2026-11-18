<script setup lang="ts">
import DecisionButtons from './DecisionButtons.vue'
import formatEventTime from '~/utils/format-event-time'

const {
  suggestion = undefined,
  timeZone,
  busy = false,
  pending = undefined,
} = defineProps<{
  /** The active suggestion; no bar without one. */
  suggestion?: Calendar.Suggestion
  timeZone: string
  busy?: boolean
  pending?: Calendar.DecisionVerb
}>()

const emit = defineEmits<{
  decide: [decision: Calendar.DecisionVerb]
}>()

/** "every week on Wednesday · Wed 18:00 – 19:00", or the time alone. */
const when = computed(() => {
  if (!suggestion) {
    return ''
  }
  const time = formatEventTime.withWeekday(suggestion.event, timeZone)
  const repeats = formatEventTime.pattern(suggestion.series)
  return repeats ? `${repeats} · ${time}` : time
})
</script>

<template>
  <!-- The calendar fixes it to the bottom below `lg`, like the inbox's action bar -->
  <section
    v-if="suggestion"
    aria-label="Suggestion"
    class="border-t border-default bg-default px-6 py-3 shadow-xs"
  >
    <p class="truncate text-sm">
      <span class="font-medium text-highlighted">{{ suggestion.event.title }}</span>
      <span class="text-muted"> · {{ suggestion.source.name }}</span>
    </p>
    <!-- The pattern too: Accept on a series copies all of it -->
    <p class="truncate text-sm text-muted">{{ when }}</p>
    <DecisionButtons
      class="mt-2"
      layout="bar"
      :title="suggestion.event.title"
      :busy="busy"
      :pending="pending"
      @decide="emit('decide', $event)"
    />
  </section>
</template>
