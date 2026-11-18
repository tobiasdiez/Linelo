<script setup lang="ts">
import WeekFooter from './WeekFooter.vue'
</script>

<template>
  <Stories title="Calendar/Week Footer" :component="WeekFooter">
    <Story title="More In Later Weeks">
      <WeekFooter class="max-w-3xl p-6" />
    </Story>
  </Stories>
</template>
