<script setup lang="ts">
import SuggestionBar from './SuggestionBar.vue'
import calendarBuilders from '~/data/calendar-builders'

const { stories, timeZone } = calendarBuilders
</script>

<template>
  <Stories title="Calendar/Suggestion Bar" :component="SuggestionBar">
    <!-- The calendar fixes the bar to the bottom below `lg`; here it is shown in place -->
    <Story title="Active Suggestion">
      <div class="max-w-md">
        <SuggestionBar :suggestion="stories.buildNight" :time-zone="timeZone" />
      </div>
    </Story>
    <Story title="Series">
      <div class="max-w-md">
        <SuggestionBar :suggestion="stories.rehearsal" :time-zone="timeZone" />
      </div>
    </Story>
    <Story title="Not For Me In Flight">
      <div class="max-w-md">
        <SuggestionBar
          :suggestion="stories.buildNight"
          :time-zone="timeZone"
          busy
          pending="dismiss"
        />
      </div>
    </Story>
  </Stories>
</template>
