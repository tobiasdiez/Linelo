<script setup lang="ts">
import type { AISuggestion, EmailAction } from '~/types/email'

const emit = defineEmits<{
  action: [suggestion: AISuggestion]
}>()

const props = defineProps<{
  suggestions: AISuggestion[]
  disabled: boolean
}>()

// Map action types to icons
const actionIcons: Record<EmailAction, string> = {
  reply: 'i-lucide-reply',
  handled: 'i-lucide-check-circle',
  delegate: 'i-lucide-forward',
  task: 'i-lucide-square-plus',
}

// Sort suggestions by confidence (highest first)
const sortedSuggestions = computed(() => {
  return [...props.suggestions].sort((a, b) => b.confidence - a.confidence)
})

// Keyboard shortcuts for numbered options
defineShortcuts({
  '1': () => !props.disabled && sortedSuggestions.value[0] && emit('action', sortedSuggestions.value[0]),
  '2': () => !props.disabled && sortedSuggestions.value[1] && emit('action', sortedSuggestions.value[1]),
  '3': () => !props.disabled && sortedSuggestions.value[2] && emit('action', sortedSuggestions.value[2]),
  '4': () => !props.disabled && sortedSuggestions.value[3] && emit('action', sortedSuggestions.value[3]),
  '5': () => !props.disabled && sortedSuggestions.value[4] && emit('action', sortedSuggestions.value[4]),
})
</script>

<template>
  <div class="fixed bottom-0 left-0 right-0 z-10 pb-6 pt-6 bg-gradient-to-t from-warm-100 via-warm-100/95 to-transparent">
    <div class="max-w-[680px] mx-auto px-4 md:px-6">
      <!-- Unified Action Options - Vertical Stack -->
      <div class="flex flex-col gap-2">
        <button
          v-for="(suggestion, index) in sortedSuggestions"
          :key="suggestion.id"
          :disabled="disabled"
          :aria-label="`${suggestion.description} (Press ${index + 1})`"
          :class="[
            'group relative flex items-center gap-3 w-full px-4 py-3 rounded-md text-left transition-all duration-150',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-linelo-500/40 focus-visible:ring-offset-2',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'active:scale-[0.99]',
            // Primary emphasis for highest confidence (first item)
            index === 0
              ? 'bg-linelo-50 border border-linelo-400 shadow-[var(--shadow-button)] hover:shadow-[var(--shadow-card-hover)] hover:bg-linelo-100'
              : 'bg-white border border-warm-200 shadow-[var(--shadow-button)] hover:shadow-[var(--shadow-card-hover)] hover:border-linelo-400',
          ]"
          @click="emit('action', suggestion)"
        >
          <!-- Action Icon -->
          <UIcon
            :name="actionIcons[suggestion.action]"
            :class="[
              'size-5 shrink-0 transition-colors',
              index === 0 ? 'text-linelo-600' : 'text-warm-500 group-hover:text-linelo-600',
            ]"
          />
          
          <!-- Action Label -->
          <span
            :class="[
              'flex-1 text-sm font-medium',
              index === 0 ? 'text-slate-900' : 'text-warm-700 group-hover:text-slate-900',
            ]"
          >
            {{ suggestion.description }}
          </span>
          
          <!-- Keyboard Shortcut Badge -->
          <span
            class="hidden md:flex items-center justify-center size-5 rounded text-[10px] font-mono text-warm-400 bg-warm-100 group-hover:bg-warm-200 transition-colors"
          >
            {{ index + 1 }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
