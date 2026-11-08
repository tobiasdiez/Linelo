<script setup lang="ts">
import FocusableTitle from '~/utils/focusable-title'
</script>

<template>
  <div class="mx-auto max-w-xl px-6 py-24 motion-safe:animate-fade-in">
    <UEmpty
      :as="{ title: FocusableTitle }"
      title="Inbox zero."
      description="Nothing is waiting on you. Time for something else."
      variant="naked"
      size="xl"
    />
  </div>
</template>
