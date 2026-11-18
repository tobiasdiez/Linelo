<script setup lang="ts">
import DayGroup from './DayGroup.vue'
import calendarTime from '#shared/utils/calendar-time'
import groupWeek from '~/utils/week-days'
import week from '~/utils/week'

const SKELETON_ROWS = 2

const {
  monday = undefined,
  events = [],
  suggestions = [],
  timeZone = undefined,
  today = undefined,
  activeKey = undefined,
  loading = false,
  busy = false,
  pending = undefined,
} = defineProps<{
  /** The Monday of the week; unknown before the browser chose it, as while rendering on the server. */
  monday?: string
  events?: readonly Calendar.CalendarEvent[]
  suggestions?: readonly Calendar.Suggestion[]
  timeZone?: string
  /** Today's date in the zone: marked, and never collapsed. */
  today?: string
  activeKey?: string
  /** Skeleton rows under the day headings while the week is fetched. */
  loading?: boolean
  busy?: boolean
  pending?: Calendar.DecisionVerb
}>()

const emit = defineEmits<{
  activate: [key: string]
  decide: [decision: Calendar.DecisionVerb]
}>()

/** The days to show, once the week, the zone and its answer are there. */
const shown = computed(() =>
  monday && timeZone && today && !loading
    ? { timeZone, groups: groupWeek({ monday, events, suggestions, timeZone, today, activeKey }) }
    : undefined,
)
/** Seven days of skeletons, with their headings once the week is known; the same height either way. */
const skeletonDays = computed(() =>
  Array.from({ length: calendarTime.DAYS_PER_WEEK }, (_, index) =>
    monday ? week.addDays(monday, index) : `day-${index}`,
  ),
)
</script>

<template>
  <div class="space-y-6">
    <template v-if="shown">
      <DayGroup
        v-for="group in shown.groups"
        :key="group.kind === 'day' ? group.date : group.from"
        :group="group"
        :time-zone="shown.timeZone"
        :active-key="activeKey"
        :busy="busy"
        :pending="pending"
        @activate="emit('activate', $event)"
        @decide="emit('decide', $event)"
      />
    </template>
    <template v-else>
      <div v-for="date in skeletonDays" :key="date" aria-hidden="true">
        <!-- A div: a skeleton is a div, which a paragraph cannot hold -->
        <div class="h-[1.375rem] text-sm font-semibold text-highlighted">
          <template v-if="monday">
            {{ week.dayLabel(date)
            }}<span v-if="date === today" class="font-medium text-primary-800"> · Today</span>
          </template>
          <USkeleton v-else class="h-full w-32" />
        </div>
        <div class="mt-2 space-y-2 pl-3">
          <USkeleton v-for="row in SKELETON_ROWS" :key="row" class="h-5 w-full max-w-md" />
        </div>
      </div>
    </template>
  </div>
</template>
