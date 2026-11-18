<script setup lang="ts">
import week from '~/utils/week'

const { monday = undefined, current = false } = defineProps<{
  /** The Monday of the week; unknown until the browser chose it. */
  monday?: string
  /** The week of today: the eyebrow says so, and Today is not needed. */
  current?: boolean
}>()

const emit = defineEmits<{
  previous: []
  next: []
  today: []
}>()

const heading = useTemplateRef<HTMLElement>('heading')

/** Moves focus to the range, which announces the week. */
function focus(): void {
  heading.value?.focus()
}

defineExpose({ focus })
</script>

<template>
  <div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
    <div class="min-w-0">
      <p class="h-4 text-2xs font-semibold tracking-wide text-muted uppercase">
        <template v-if="current">This week</template>
      </p>
      <!-- Focusable so the page can move focus here after a week change -->
      <h1
        ref="heading"
        tabindex="-1"
        class="mt-1 text-3xl font-semibold tracking-tight text-pretty outline-none"
      >
        <template v-if="monday">{{ week.rangeLabel(monday) }}</template>
        <USkeleton v-else class="h-9 w-72 max-w-full" />
      </h1>
    </div>
    <div class="flex items-center gap-1">
      <UButton
        icon="i-lucide-chevron-left"
        variant="ghost"
        aria-label="Previous week"
        aria-keyshortcuts="ArrowLeft"
        :disabled="!monday"
        @click="emit('previous')"
      />
      <!-- Its place is kept on the current week, so the arrows never move -->
      <UButton
        label="Today"
        variant="ghost"
        :class="{ invisible: !monday || current }"
        @click="emit('today')"
      />
      <UButton
        icon="i-lucide-chevron-right"
        variant="ghost"
        aria-label="Next week"
        aria-keyshortcuts="ArrowRight"
        :disabled="!monday"
        @click="emit('next')"
      />
    </div>
  </div>
</template>
