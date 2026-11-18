<script setup lang="ts">
import CalendarStatus from './CalendarStatus.vue'
</script>

<template>
  <Stories title="Calendar/Calendar Status" :component="CalendarStatus">
    <Story title="Failed">
      <CalendarStatus />
    </Story>
    <Story title="Trying Again">
      <CalendarStatus busy />
    </Story>
  </Stories>
</template>
