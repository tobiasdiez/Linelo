<script setup lang="ts">
// The title, focusable so the page can move focus here when the last message is resolved
const FocusableTitle = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h('h1', { tabindex: -1 }, slots.default?.()),
})
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
