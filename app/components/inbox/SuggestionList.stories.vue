<script setup lang="ts">
import SuggestionList from './SuggestionList.vue'
import inboxBuilders from '~/data/inbox-builders'

const vendorReview = inboxBuilders.storyItem('thread-vendor-review')
const newsletter = inboxBuilders.storyItem('thread-newsletter')
</script>

<template>
  <Stories title="Inbox/Suggestion List" :component="SuggestionList">
    <Story title="Three Suggestions">
      <SuggestionList class="max-w-96" :suggestions="vendorReview.suggestions" />
    </Story>
    <Story title="One Suggestion">
      <SuggestionList class="max-w-96" :suggestions="newsletter.suggestions" />
    </Story>
  </Stories>
</template>
