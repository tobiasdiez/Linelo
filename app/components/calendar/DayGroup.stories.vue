<script setup lang="ts">
import DayGroup from './DayGroup.vue'
import calendarBuilders from '~/data/calendar-builders'

const { stories, timeZone } = calendarBuilders

const thursday: CalendarView.Day = {
  kind: 'day',
  date: '2026-11-19',
  today: false,
  rows: [
    { kind: 'event', key: 'event:weekly-sync', event: stories.weeklySync },
    { kind: 'suggestion', key: stories.opticsTalk.key, suggestion: stories.opticsTalk },
    { kind: 'suggestion', key: stories.buildNight.key, suggestion: stories.buildNight },
  ],
  moreFrom: ['Choir'],
}
const freeToday: CalendarView.Day = {
  kind: 'day',
  date: '2026-11-17',
  today: true,
  rows: [],
  moreFrom: [],
}
const freeRun: CalendarView.FreeRun = { kind: 'free', from: '2026-11-20', to: '2026-11-22' }
const freeDay: CalendarView.FreeRun = { kind: 'free', from: '2026-11-18', to: '2026-11-18' }
</script>

<template>
  <Stories title="Calendar/Day Group" :component="DayGroup">
    <Story title="Own Events And Suggestions">
      <DayGroup
        class="max-w-3xl p-6"
        :group="thursday"
        :time-zone="timeZone"
        :active-key="stories.buildNight.key"
      />
    </Story>
    <Story title="Today, Free">
      <DayGroup class="max-w-3xl p-6" :group="freeToday" :time-zone="timeZone" />
    </Story>
    <Story title="Free Days Collapsed">
      <DayGroup class="max-w-3xl p-6" :group="freeRun" :time-zone="timeZone" />
    </Story>
    <Story title="One Free Day">
      <DayGroup class="max-w-3xl p-6" :group="freeDay" :time-zone="timeZone" />
    </Story>
  </Stories>
</template>
