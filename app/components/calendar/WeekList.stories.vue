<script setup lang="ts">
import WeekList from './WeekList.vue'
import calendarBuilders from '~/data/calendar-builders'

const { monday, today, timeZone, storyWeek, stories, suggestion, sources } = calendarBuilders
const answer = storyWeek()
const busyThursday = [
  ...answer.suggestions,
  suggestion({
    id: 'choir-social',
    title: 'Choir social',
    source: sources.choir,
    start: '2026-11-19T19:00:00Z',
    end: '2026-11-19T21:00:00Z',
  }),
]
</script>

<template>
  <Stories title="Calendar/Week List" :component="WeekList">
    <Story title="Week With Suggestions">
      <WeekList
        class="max-w-3xl p-6"
        :monday="monday"
        :events="answer.events"
        :suggestions="answer.suggestions"
        :time-zone="timeZone"
        :today="today"
        :active-key="stories.buildNight.key"
      />
    </Story>
    <Story title="More Than Three Suggestions On A Day">
      <WeekList
        class="max-w-3xl p-6"
        :monday="monday"
        :events="answer.events"
        :suggestions="busyThursday"
        :time-zone="timeZone"
        :today="today"
        :active-key="stories.rehearsal.key"
      />
    </Story>
    <Story title="Mostly Free">
      <WeekList
        class="max-w-3xl p-6"
        :monday="monday"
        :events="[stories.planning]"
        :time-zone="timeZone"
        :today="today"
      />
    </Story>
    <Story title="An Event Over Several Days">
      <WeekList
        class="max-w-3xl p-6"
        :monday="monday"
        :events="[stories.planning, stories.offsite]"
        :time-zone="timeZone"
        :today="today"
      />
    </Story>
    <Story title="Loading">
      <WeekList
        class="max-w-3xl p-6"
        :monday="monday"
        :time-zone="timeZone"
        :today="today"
        loading
      />
    </Story>
  </Stories>
</template>
