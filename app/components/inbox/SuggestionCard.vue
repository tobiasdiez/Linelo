<script setup lang="ts">
// Name what choosing the card does, so cards that resolve at once stand out from replies
const TAG_LABELS: Record<Inbox.Suggestion['kind'], string> = {
  reply: 'Reply',
  handled: 'Mark handled',
  task: 'Add to Todoist',
}

const {
  suggestion,
  position,
  selected = false,
  disabled = false,
} = defineProps<{
  suggestion: Inbox.Suggestion
  /** Position in the list (1 to 3), doubling as its keyboard shortcut. */
  position: number
  /** Shown as the chosen suggestion while replying; not interactive then. */
  selected?: boolean
  disabled?: boolean
}>()

const root = useTemplateRef<HTMLElement>('root')

function focus(): void {
  root.value?.focus()
}

defineExpose({ focus })
</script>

<template>
  <component
    :is="selected ? 'div' : 'button'"
    ref="root"
    :type="selected ? undefined : 'button'"
    :disabled="selected ? undefined : disabled"
    :aria-keyshortcuts="selected ? undefined : String(position)"
    class="flex w-full flex-col gap-0.5 rounded-lg border px-3.5 py-2.5 text-left transition-colors"
    :class="
      selected
        ? 'border-primary-300 bg-primary-50'
        : 'border-default bg-muted hover:bg-elevated focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-75'
    "
  >
    <span class="flex items-center justify-between gap-2">
      <span
        class="inline-flex items-center gap-1.5 text-2xs font-semibold tracking-wide uppercase"
        :class="selected ? 'text-primary-900' : 'text-secondary-900'"
      >
        <UIcon v-if="selected" name="i-lucide-check" class="size-4 text-primary-700" />
        {{ TAG_LABELS[suggestion.kind] }}
      </span>
      <UKbd v-if="!selected" :value="String(position)" aria-hidden="true" class="max-sm:hidden" />
    </span>
    <span class="text-sm font-medium">{{ suggestion.label }}</span>
  </component>
</template>
