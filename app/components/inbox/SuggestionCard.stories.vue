<script setup lang="ts">
import SuggestionCard from './SuggestionCard.vue'
import inboxBuilders from '~/data/inbox-builders'

const { storySuggestion } = inboxBuilders
const reply = storySuggestion('thread-vendor-review', 'vendor-review-confirm', 'reply')
const task = storySuggestion('thread-vendor-review', 'vendor-review-task', 'task')
const handled = storySuggestion('thread-newsletter', 'newsletter-handled', 'handled')
</script>

<template>
  <Stories title="Inbox/Suggestion Card" :component="SuggestionCard">
    <Story title="Reply">
      <SuggestionCard class="max-w-96" :suggestion="reply" :position="1" />
    </Story>
    <Story title="Mark Handled">
      <SuggestionCard class="max-w-96" :suggestion="handled" :position="1" />
    </Story>
    <Story title="Add To Todoist">
      <SuggestionCard class="max-w-96" :suggestion="task" :position="3" />
    </Story>
    <Story title="Selected">
      <SuggestionCard class="max-w-96" :suggestion="reply" :position="1" selected />
    </Story>
    <Story title="Disabled">
      <SuggestionCard class="max-w-96" :suggestion="reply" :position="1" disabled />
    </Story>
  </Stories>
</template>
