<script setup lang="ts">
import InboxScreen from './InboxScreen.vue'
import inboxBuilders from '~/data/inbox-builders'

const longThread = inboxBuilders.storyItem('thread-migration-plan')
const vendorReview = inboxBuilders.storyItem('thread-vendor-review')
// Ranked by the rules alone: a message with nothing to suggest, and no model involved
const unranked = {
  ...inboxBuilders.storyItem('thread-offsite-venue'),
  whyShown: 'From someone you have written to. Sent to you alone.',
  suggestions: [],
  assisted: false,
}
</script>

<template>
  <Stories title="Inbox/Inbox Screen" :component="InboxScreen">
    <Story title="Long Thread">
      <InboxScreen :item="longThread" />
    </Story>
    <Story title="Direct Ask">
      <InboxScreen :item="vendorReview" />
    </Story>
    <Story title="Without Suggestions">
      <InboxScreen :item="unranked" />
    </Story>
  </Stories>
</template>
