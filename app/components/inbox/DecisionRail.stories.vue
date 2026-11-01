<script setup lang="ts">
import DecisionRail from './DecisionRail.vue'
import inboxBuilders from '~/data/inbox-builders'

const vendorReview = inboxBuilders.storyItem('thread-vendor-review')
const offsite = inboxBuilders.storyItem('thread-offsite-venue')
</script>

<template>
  <Stories title="Inbox/Decision Rail" :component="DecisionRail">
    <Story title="Decide">
      <DecisionRail class="max-w-96" :item="vendorReview" />
    </Story>
    <Story title="Decide While Busy">
      <DecisionRail class="max-w-96" :item="vendorReview" busy />
    </Story>
    <Story title="Reply With Follow-up Task">
      <DecisionRail
        class="max-w-96"
        :item="vendorReview"
        mode="reply"
        chosen-suggestion-id="vendor-review-confirm"
      />
    </Story>
    <Story title="Reply Without Follow-up Task">
      <DecisionRail
        class="max-w-96"
        :item="offsite"
        mode="reply"
        chosen-suggestion-id="offsite-book"
      />
    </Story>
    <Story title="Manual Reply">
      <DecisionRail class="max-w-96" :item="offsite" mode="reply" />
    </Story>
  </Stories>
</template>
