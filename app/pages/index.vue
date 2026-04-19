<script setup lang="ts">
const {
  currentMessage,
  suggestions,
  phase,
  phaseText,
  isComplete,
  isTransitioning,
  transitionDirection,
  handleAction,
  handleSuggestion,
} = useEmailQueue()

// Set page metadata
useHead({
  title: 'Linelo — Email Triage',
  meta: [
    { name: 'description', content: 'A calm approach to email triage. Process your inbox one message at a time.' },
  ],
})

// Announce message changes to screen readers
const announcement = ref('')
watch(currentMessage, (message) => {
  if (message) {
    announcement.value = `Now showing message from ${message.sender.name} about ${message.subject}`
  }
  else {
    announcement.value = 'All messages processed'
  }
})
</script>

<template>
  <div class="min-h-screen bg-warm-100">
    <!-- Screen reader announcements -->
    <div
      role="status"
      aria-live="polite"
      class="sr-only"
    >
      {{ announcement }}
    </div>

    <!-- Header -->
    <QueueHeader
      :phase="phase"
      :phase-text="phaseText"
    />

    <!-- Main Content Area -->
    <main class="pt-14 pb-44 px-4 md:px-6 flex items-center justify-center min-h-screen">
      <!-- Empty State: Inbox Zero -->
      <EmptyState v-if="isComplete" />

      <!-- Message Display -->
      <MessageCard
        v-else-if="currentMessage"
        :message="currentMessage"
        :is-transitioning="isTransitioning"
        :transition-direction="transitionDirection"
      />

      <!-- Loading State -->
      <MessageSkeleton v-else />
    </main>

    <!-- Action Bar (only when there's a message) -->
    <ActionBar
      v-if="!isComplete && currentMessage"
      :suggestions="suggestions"
      :disabled="isTransitioning"
      @action="handleAction"
      @suggestion="handleSuggestion"
    />
  </div>
</template>
