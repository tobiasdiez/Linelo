<script setup lang="ts">
import WeekHeader from './WeekHeader.vue'
</script>

<template>
  <Stories title="Calendar/Week Header" :component="WeekHeader">
    <Story title="This Week">
      <WeekHeader class="max-w-3xl p-6" monday="2026-11-16" current />
    </Story>
    <Story title="Another Week">
      <WeekHeader class="max-w-3xl p-6" monday="2026-11-30" />
    </Story>
    <Story title="Across The Year">
      <WeekHeader class="max-w-3xl p-6" monday="2026-12-28" />
    </Story>
    <Story title="Before The Week Is Known">
      <WeekHeader class="max-w-3xl p-6" />
    </Story>
  </Stories>
</template>
