<script setup lang="ts">
import SuggestionRow from './SuggestionRow.vue'
import calendarBuilders from '~/data/calendar-builders'

const { stories, timeZone } = calendarBuilders
</script>

<template>
  <Stories title="Calendar/Suggestion Row" :component="SuggestionRow">
    <Story title="Inactive">
      <ul class="max-w-3xl p-6">
        <SuggestionRow :suggestion="stories.buildNight" day="2026-11-19" :time-zone="timeZone" />
      </ul>
    </Story>
    <Story title="Active">
      <ul class="max-w-3xl p-6">
        <SuggestionRow
          :suggestion="stories.buildNight"
          day="2026-11-19"
          :time-zone="timeZone"
          active
        />
      </ul>
    </Story>
    <Story title="Series That Overlaps">
      <ul class="max-w-3xl p-6">
        <SuggestionRow :suggestion="stories.opticsTalk" day="2026-11-19" :time-zone="timeZone" />
        <SuggestionRow
          :suggestion="stories.opticsTalk"
          day="2026-11-19"
          :time-zone="timeZone"
          active
        />
      </ul>
    </Story>
    <Story title="Accepting">
      <ul class="max-w-3xl p-6">
        <SuggestionRow
          :suggestion="stories.buildNight"
          day="2026-11-19"
          :time-zone="timeZone"
          active
          busy
          pending="accept"
        />
      </ul>
    </Story>
  </Stories>
</template>
