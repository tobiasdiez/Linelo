<script setup lang="ts">
import type { AISuggestion, EmailAction } from '~/types/email'

defineProps<{
  suggestions: AISuggestion[]
  disabled: boolean
}>()

const emit = defineEmits<{
  action: [action: EmailAction]
  suggestion: [suggestion: AISuggestion]
}>()

const coreActions = [
  { action: 'reply' as const, label: 'Reply', icon: 'i-lucide-reply', shortcut: 'R' },
  { action: 'handled' as const, label: 'Handled', icon: 'i-lucide-check-circle', shortcut: 'H' },
  { action: 'delegate' as const, label: 'Delegate', icon: 'i-lucide-forward', shortcut: 'D' },
  { action: 'task' as const, label: 'Add Task', icon: 'i-lucide-square-plus', shortcut: 'T' },
]

// Keyboard shortcuts
defineShortcuts({
  r: () => !props.disabled && emit('action', 'reply'),
  h: () => !props.disabled && emit('action', 'handled'),
  d: () => !props.disabled && emit('action', 'delegate'),
  t: () => !props.disabled && emit('action', 'task'),
})

const props = defineProps<{
  suggestions: AISuggestion[]
  disabled: boolean
}>()
</script>

<template>
  <div class="fixed bottom-0 left-0 right-0 z-10 pb-6 pt-4 bg-gradient-to-t from-warm-100 via-warm-100 to-transparent">
    <div class="max-w-[680px] mx-auto px-4 md:px-6 space-y-4">
      <!-- AI Suggestions -->
      <div
        v-if="suggestions.length > 0"
        class="flex flex-wrap justify-center gap-2"
      >
        <button
          v-for="suggestion in suggestions"
          :key="suggestion.id"
          :disabled="disabled"
          class="group inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-warm-200 rounded-lg text-sm font-medium text-warm-700 shadow-[var(--shadow-button)] hover:shadow-[var(--shadow-card-hover)] hover:border-linelo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-linelo-500/40 focus-visible:ring-offset-2 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          @click="emit('suggestion', suggestion)"
        >
          <span>{{ suggestion.description }}</span>
        </button>
      </div>

      <!-- Core Action Buttons -->
      <div class="flex justify-center gap-3 md:gap-4">
        <button
          v-for="action in coreActions"
          :key="action.action"
          :disabled="disabled"
          :aria-label="`${action.label} (${action.shortcut})`"
          class="group relative flex flex-col items-center gap-1.5 px-4 py-3 md:px-6 md:py-3.5 bg-white border border-warm-200 rounded-lg text-warm-600 shadow-[var(--shadow-button)] hover:shadow-[var(--shadow-card-hover)] hover:border-linelo-500 hover:text-warm-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-linelo-500/40 focus-visible:ring-offset-2 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          @click="emit('action', action.action)"
        >
          <UIcon :name="action.icon" class="size-5 md:size-6 group-hover:text-linelo-600 transition-colors" />
          <span class="text-xs md:text-sm font-medium">{{ action.label }}</span>
          <span class="absolute -bottom-1 right-1 text-[10px] font-mono text-warm-400 opacity-0 md:opacity-100">
            {{ action.shortcut }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
