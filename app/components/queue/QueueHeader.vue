<script setup lang="ts">
import type { QueuePhase } from '~/types/email'

defineProps<{
  phaseText: string
  phase: QueuePhase
}>()
</script>

<template>
  <header class="fixed top-0 left-0 right-0 z-10 h-14 px-6 md:px-8 flex items-center justify-between bg-warm-100">
    <!-- Left: Brand -->
    <div class="flex items-center">
      <AppLogo :size="24" class="opacity-60 hover:opacity-80 transition-opacity" />
    </div>

    <!-- Center: Progress Indicator -->
    <div
      v-if="phase !== 'complete'"
      class="hidden md:flex items-center gap-2"
    >
      <span class="text-sm text-warm-500 lowercase tracking-wide">
        {{ phaseText }}
      </span>
    </div>

    <!-- Right: Utility Controls -->
    <div class="flex items-center gap-2">
      <UButton
        icon="i-lucide-settings"
        variant="ghost"
        color="neutral"
        size="sm"
        aria-label="Settings"
        :ui="{ base: 'text-warm-500 hover:text-warm-700' }"
      />
      <UAvatar
        size="sm"
        text="JD"
        :ui="{ root: 'ring-1 ring-warm-200' }"
      />
    </div>
  </header>
</template>
