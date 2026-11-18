<script setup lang="ts">
import EventRow from './EventRow.vue'
import SuggestionRow from './SuggestionRow.vue'
import calendarLocale from '#shared/utils/calendar-locale'
import week from '~/utils/week'

const {
  group,
  timeZone,
  activeKey = undefined,
  busy = false,
  pending = undefined,
} = defineProps<{
  group: CalendarView.Group
  timeZone: string
  activeKey?: string
  busy?: boolean
  pending?: Calendar.DecisionVerb
}>()

const emit = defineEmits<{
  activate: [key: string]
  decide: [decision: Calendar.DecisionVerb]
}>()

const heading = computed(() =>
  group.kind === 'free' && group.from !== group.to
    ? week.runLabel(group.from, group.to)
    : week.dayLabel(group.kind === 'free' ? group.from : group.date),
)
const isToday = computed(() => group.kind === 'day' && group.today)
const day = computed(() => (group.kind === 'day' ? group.date : group.from))
const moreFrom = computed(() => {
  const names = group.kind === 'day' ? group.moreFrom : []
  return names.length > 0
    ? `more from ${new Intl.ListFormat(calendarLocale).format(names)}`
    : undefined
})
</script>

<template>
  <!-- Not a landmark: seven regions would crowd the page's landmarks -->
  <div>
    <h2 class="text-sm font-semibold text-highlighted">
      {{ heading }}<span v-if="isToday" class="font-medium text-primary-800"> · Today</span>
    </h2>
    <p
      v-if="group.kind === 'free' || group.rows.length === 0"
      class="border-l-2 border-transparent py-1.5 pl-2.5 text-sm text-muted"
    >
      Free
    </p>
    <!-- Decided suggestions fade out; nothing moves when the week changes -->
    <TransitionGroup
      v-else
      tag="ul"
      class="mt-1"
      leave-active-class="motion-safe:transition-opacity motion-safe:duration-300"
      leave-to-class="opacity-0"
    >
      <template v-for="row in group.rows" :key="row.key">
        <EventRow v-if="row.kind === 'event'" :event="row.event" :day="day" :time-zone="timeZone" />
        <SuggestionRow
          v-else
          :suggestion="row.suggestion"
          :day="day"
          :time-zone="timeZone"
          :active="row.key === activeKey"
          :busy="busy"
          :pending="row.key === activeKey ? pending : undefined"
          @activate="emit('activate', row.key)"
          @decide="emit('decide', $event)"
        />
      </template>
    </TransitionGroup>
    <p v-if="moreFrom" class="border-l-2 border-transparent py-1 pl-2.5 text-xs text-muted">
      {{ moreFrom }}
    </p>
  </div>
</template>
