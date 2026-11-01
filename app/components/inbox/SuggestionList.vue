<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import RailHeading from './RailHeading.vue'
import SuggestionCard from './SuggestionCard.vue'

interface Focusable {
  focus: () => void
}

const { suggestions, busy = false } = defineProps<{
  suggestions: Inbox.Suggestion[]
  /** Disables the suggestions, and their number keys, while an action is being carried out. */
  busy?: boolean
}>()

const emit = defineEmits<{
  choose: [suggestion: Inbox.Suggestion]
}>()

const headingId = useId()
const cards = new Map<string, Focusable>()

function isFocusable(value: unknown): value is Focusable {
  return (
    typeof value === 'object' &&
    value !== undefined &&
    value !== null &&
    'focus' in value &&
    typeof value.focus === 'function'
  )
}

function registerCard(id: string, card: Element | ComponentPublicInstance | null): void {
  if (isFocusable(card)) {
    cards.set(id, card)
  } else {
    cards.delete(id)
  }
}

function focusSuggestion(id: string): void {
  cards.get(id)?.focus()
}

// Keys 1 to 3 pick the suggestion at that position
defineShortcuts(
  computed(() =>
    busy
      ? {}
      : Object.fromEntries(
          suggestions.map((suggestion, index) => [
            String(index + 1),
            ignoreRepeats(() => emit('choose', suggestion)),
          ]),
        ),
  ),
)

defineExpose({ focusSuggestion })
</script>

<template>
  <section :aria-labelledby="headingId">
    <RailHeading :heading-id="headingId" ai>Suggested</RailHeading>
    <ul class="space-y-2">
      <li v-for="(suggestion, index) in suggestions" :key="suggestion.id">
        <SuggestionCard
          :ref="card => registerCard(suggestion.id, card)"
          :suggestion="suggestion"
          :position="index + 1"
          :disabled="busy"
          @click="emit('choose', suggestion)"
        />
      </li>
    </ul>
  </section>
</template>
