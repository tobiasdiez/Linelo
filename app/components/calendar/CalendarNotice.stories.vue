<script setup lang="ts">
import CalendarNotice from './CalendarNotice.vue'
</script>

<template>
  <Stories title="Calendar/Calendar Notice" :component="CalendarNotice">
    <Story title="Choose Calendars">
      <CalendarNotice class="max-w-3xl p-6" :notice="{ kind: 'choose' }" />
    </Story>
    <Story title="Nothing New">
      <CalendarNotice class="max-w-3xl p-6" :notice="{ kind: 'nothing-new' }" />
    </Story>
    <Story title="One Calendar Unreachable">
      <CalendarNotice
        class="max-w-3xl p-6"
        :notice="{ kind: 'unreachable', names: ['Robotics Club'] }"
      />
    </Story>
    <Story title="All Calendars Unreachable">
      <CalendarNotice class="max-w-3xl p-6" :notice="{ kind: 'all-unreachable' }" />
    </Story>
    <Story title="Trying Again">
      <CalendarNotice class="max-w-3xl p-6" :notice="{ kind: 'all-unreachable' }" busy />
    </Story>
  </Stories>
</template>
