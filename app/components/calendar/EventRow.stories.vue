<script setup lang="ts">
import EventRow from './EventRow.vue'
import calendarBuilders from '~/data/calendar-builders'

const { event, stories, timeZone } = calendarBuilders
const conference = event({
  id: 'conference',
  title: 'Robotics conference',
  start: '2026-11-17T08:00:00Z',
  end: '2026-11-19T16:00:00Z',
  location: 'Messe Berlin',
})
const withoutLink = event({ id: 'no-link', title: 'Dentist', webLink: undefined })
</script>

<template>
  <Stories title="Calendar/Event Row" :component="EventRow">
    <Story title="Timed">
      <ul class="max-w-3xl p-6">
        <EventRow :event="stories.vendorReview" day="2026-11-17" :time-zone="timeZone" />
      </ul>
    </Story>
    <Story title="All Day">
      <ul class="max-w-3xl p-6">
        <EventRow :event="stories.planning" day="2026-11-18" :time-zone="timeZone" />
      </ul>
    </Story>
    <Story title="Copy From Another Calendar">
      <ul class="max-w-3xl p-6">
        <EventRow :event="stories.weeklySync" day="2026-11-19" :time-zone="timeZone" />
      </ul>
    </Story>
    <Story title="Several Days">
      <ul class="max-w-3xl p-6">
        <EventRow :event="conference" day="2026-11-17" :time-zone="timeZone" />
        <EventRow :event="conference" day="2026-11-18" :time-zone="timeZone" />
        <EventRow :event="conference" day="2026-11-19" :time-zone="timeZone" />
      </ul>
    </Story>
    <Story title="Without A Link">
      <ul class="max-w-3xl p-6">
        <EventRow :event="withoutLink" day="2026-11-19" :time-zone="timeZone" />
      </ul>
    </Story>
  </Stories>
</template>
