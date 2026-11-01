<script setup lang="ts">
import ThreadView from './ThreadView.vue'
import inboxBuilders from '~/data/inbox-builders'

const vendorReview = inboxBuilders.storyItem('thread-vendor-review')
const newsletter = inboxBuilders.storyItem('thread-newsletter')
</script>

<template>
  <Stories title="Inbox/Thread View" :component="ThreadView">
    <Story title="Thread">
      <ThreadView
        class="max-w-3xl p-6"
        :thread="vendorReview.thread"
        :why-shown="vendorReview.whyShown"
      />
    </Story>
    <Story title="Single Message">
      <ThreadView
        class="max-w-3xl p-6"
        :thread="newsletter.thread"
        :why-shown="newsletter.whyShown"
      />
    </Story>
  </Stories>
</template>
