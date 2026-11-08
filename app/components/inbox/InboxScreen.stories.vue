<script setup lang="ts">
import InboxScreen from './InboxScreen.vue'
import inboxBuilders from '~/data/inbox-builders'

const longThread = inboxBuilders.storyItem('thread-migration-plan')
const vendorReview = inboxBuilders.storyItem('thread-vendor-review')
// Mail from the mailbox has no suggestions until ranking exists
const unranked = {
  ...inboxBuilders.storyItem('thread-offsite-venue'),
  whyShown: 'Unread and sent to you directly. Newest mail comes first.',
  suggestions: [],
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
    <Story title="Unranked Mail">
      <InboxScreen :item="unranked" />
    </Story>
  </Stories>
</template>
