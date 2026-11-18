<script setup lang="ts">
import CalendarScreen from './CalendarScreen.vue'
import calendarBuilders from '~/data/calendar-builders'

const { monday, today, timeZone, storyWeek, stories } = calendarBuilders
const answer = storyWeek()
const noSources = storyWeek({ suggestions: [], moreLater: false, sourceCount: 0 })
const nothingNew = storyWeek({ suggestions: [], moreLater: false })
const unreachable = storyWeek({ unreachable: ['Choir'] })
const noneAnswered = storyWeek({
  suggestions: [],
  unreachable: ['Robotics Club', 'Department seminar', 'Choir'],
})
const offsite = storyWeek({ events: [...answer.events, stories.offsite] })
</script>

<template>
  <Stories title="Calendar/Calendar Screen" :component="CalendarScreen">
    <Story title="Week With Suggestions">
      <CalendarScreen
        :monday="monday"
        current
        :time-zone="timeZone"
        :today="today"
        :answer="answer"
        :active-key="stories.buildNight.key"
      />
    </Story>
    <Story title="No Other Calendars Chosen">
      <CalendarScreen
        :monday="monday"
        current
        :time-zone="timeZone"
        :today="today"
        :answer="noSources"
      />
    </Story>
    <Story title="Nothing New">
      <CalendarScreen
        :monday="monday"
        current
        :time-zone="timeZone"
        :today="today"
        :answer="nothingNew"
      />
    </Story>
    <Story title="A Calendar Unreachable">
      <CalendarScreen
        :monday="monday"
        current
        :time-zone="timeZone"
        :today="today"
        :answer="unreachable"
        :active-key="stories.rehearsal.key"
      />
    </Story>
    <Story title="No Other Calendar Answered">
      <CalendarScreen
        :monday="monday"
        current
        :time-zone="timeZone"
        :today="today"
        :answer="noneAnswered"
      />
    </Story>
    <Story title="An Event Over Several Days">
      <CalendarScreen
        :monday="monday"
        current
        :time-zone="timeZone"
        :today="today"
        :answer="offsite"
        :active-key="stories.buildNight.key"
      />
    </Story>
    <Story title="Accepting">
      <CalendarScreen
        :monday="monday"
        current
        :time-zone="timeZone"
        :today="today"
        :answer="answer"
        :active-key="stories.buildNight.key"
        busy
        pending="accept"
      />
    </Story>
    <Story title="Loading">
      <CalendarScreen :monday="monday" current :time-zone="timeZone" :today="today" loading />
    </Story>
    <Story title="Before The Week Is Known">
      <CalendarScreen loading />
    </Story>
  </Stories>
</template>
