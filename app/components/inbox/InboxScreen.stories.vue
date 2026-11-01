<script setup lang="ts">
import InboxScreen from './InboxScreen.vue'
import inboxBuilders from '~/data/inbox-builders'

const longThread = inboxBuilders.storyItem('thread-migration-plan')
const vendorReview = inboxBuilders.storyItem('thread-vendor-review')
</script>

<template>
  <Stories title="Inbox/Inbox Screen" :component="InboxScreen">
    <Story title="Long Thread">
      <InboxScreen :item="longThread" />
    </Story>
    <Story title="Direct Ask">
      <InboxScreen :item="vendorReview" />
    </Story>
  </Stories>
</template>
