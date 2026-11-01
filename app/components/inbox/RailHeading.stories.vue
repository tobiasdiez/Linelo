<script setup lang="ts">
import RailHeading from './RailHeading.vue'
</script>

<template>
  <Stories title="Inbox/Rail Heading" :component="RailHeading">
    <Story title="Plain">
      <RailHeading class="p-4">Decide</RailHeading>
    </Story>
    <Story title="AI-assisted">
      <RailHeading class="p-4" ai>Suggested</RailHeading>
    </Story>
  </Stories>
</template>
