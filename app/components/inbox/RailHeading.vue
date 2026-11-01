<script setup lang="ts">
const { headingId = undefined, ai = false } = defineProps<{
  /** For `aria-labelledby` on the section the heading names. */
  headingId?: string
  /** Marks the section as AI-assisted. */
  ai?: boolean
}>()
</script>

<template>
  <div class="mb-2 flex items-center gap-2">
    <h2 :id="headingId" class="text-2xs font-semibold tracking-wide text-muted uppercase">
      <slot />
    </h2>
    <UBadge v-if="ai" color="secondary" label="AI" />
  </div>
</template>
