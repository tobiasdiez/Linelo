<script setup lang="ts">
import InboxZero from './InboxZero.vue'
</script>

<template>
  <Stories title="Inbox/Inbox Zero" :component="InboxZero">
    <Story title="Standard">
      <InboxZero />
    </Story>
  </Stories>
</template>
