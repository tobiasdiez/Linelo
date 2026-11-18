<script setup lang="ts">
import CalendarConnect from './CalendarConnect.vue'
</script>

<template>
  <Stories title="Calendar/Calendar Connect" :component="CalendarConnect">
    <Story title="Allow Access">
      <CalendarConnect />
    </Story>
    <Story title="Handing Over To Microsoft">
      <CalendarConnect busy />
    </Story>
    <Story title="Cancelled">
      <CalendarConnect notice="cancelled" />
    </Story>
    <Story title="Failed">
      <CalendarConnect notice="failed" />
    </Story>
  </Stories>
</template>
