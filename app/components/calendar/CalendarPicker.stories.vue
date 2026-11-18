<script setup lang="ts">
import CalendarPicker from './CalendarPicker.vue'
import calendarBuilders from '~/data/calendar-builders'

const listing = calendarBuilders.calendarsListing()
const onlyMain = calendarBuilders.calendarsListing({
  calendars: listing.calendars.filter(calendar => calendar.main),
})
</script>

<template>
  <Stories title="Calendar/Calendar Picker" :component="CalendarPicker">
    <Story title="Calendars">
      <div class="min-h-160">
        <CalendarPicker open :listing="listing" status="ready" />
      </div>
    </Story>
    <Story title="Saving A Choice">
      <div class="min-h-160">
        <CalendarPicker
          open
          :listing="listing"
          status="ready"
          :choices="{ 'calendar-choir': true }"
        />
      </div>
    </Story>
    <Story title="Only The Main Calendar">
      <div class="min-h-160">
        <CalendarPicker open :listing="onlyMain" status="ready" />
      </div>
    </Story>
    <Story title="Loading">
      <div class="min-h-160">
        <CalendarPicker open status="loading" />
      </div>
    </Story>
    <Story title="Failed">
      <div class="min-h-160">
        <CalendarPicker open status="failed" />
      </div>
    </Story>
  </Stories>
</template>
