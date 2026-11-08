<script setup lang="ts">
import ActionList from './ActionList.vue'
</script>

<template>
  <Stories title="Inbox/Action List" :component="ActionList">
    <Story title="Standard">
      <ActionList class="max-w-96" />
    </Story>
    <Story title="Busy">
      <ActionList class="max-w-96" busy />
    </Story>
    <Story title="Waiting For Mark As Handled">
      <ActionList class="max-w-96" busy pending="handled" />
    </Story>
  </Stories>
</template>
