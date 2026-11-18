<script setup lang="ts">
import calendarLocale from '#shared/utils/calendar-locale'

const { notice, busy = false } = defineProps<{
  notice: CalendarView.Notice
  /** True while trying the other calendars again. */
  busy?: boolean
}>()

const emit = defineEmits<{
  /** Opens the picker. */
  choose: []
  /** Fetches the week again, for the other calendars. */
  retry: []
}>()

/** "Robotics Club and Choir": one line, however many did not answer. */
const names = computed(() =>
  notice.kind === 'unreachable' ? new Intl.ListFormat(calendarLocale).format(notice.names) : '',
)
</script>

<template>
  <!-- One muted line under the header, polite, as it changes after decisions; no room taken when there is nothing to say -->
  <div aria-live="polite" class="mt-2 text-sm text-muted empty:mt-0">
    <div
      v-if="notice.kind === 'choose'"
      class="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-primary-200 bg-primary-50/60 px-4 py-3"
    >
      <p class="text-toned">
        Linelo shows events from your other calendars in your week, one decision each.
      </p>
      <UButton label="Choose calendars" color="primary" variant="solid" @click="emit('choose')" />
    </div>
    <p v-else-if="notice.kind === 'nothing-new'" class="leading-8">
      Nothing new from your other calendars.
    </p>
    <p v-else-if="notice.kind === 'all-unreachable'" class="flex items-center gap-x-2 leading-8">
      <span>Couldn't reach your other calendars.</span>
      <UButton
        label="Try again"
        variant="link"
        color="primary"
        size="sm"
        class="px-0"
        :loading="busy"
        @click="emit('retry')"
      />
    </p>
    <p v-else-if="notice.kind === 'unreachable'" class="leading-8">
      {{ names }} couldn't be reached.
    </p>
  </div>
</template>
