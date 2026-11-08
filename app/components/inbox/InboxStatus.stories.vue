<script setup lang="ts">
import InboxStatus from './InboxStatus.vue'
</script>

<template>
  <Stories title="Inbox/Inbox Status" :component="InboxStatus">
    <Story title="Checking">
      <InboxStatus state="checking" />
    </Story>
    <Story title="Failed">
      <InboxStatus state="failed" />
    </Story>
    <Story title="Trying Again">
      <InboxStatus state="failed" busy />
    </Story>
  </Stories>
</template>
