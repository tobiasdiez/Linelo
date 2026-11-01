<script setup lang="ts">
import MessageTime from './MessageTime.vue'
import inboxBuilders from '~/data/inbox-builders'

const MILLISECONDS_PER_HOUR = 3_600_000
const now = inboxBuilders.now.getTime()

function hoursAgo(hours: number): string {
  return new Date(now - hours * MILLISECONDS_PER_HOUR).toISOString()
}
</script>

<template>
  <Stories title="Inbox/Message Time" :component="MessageTime">
    <Story title="Recent">
      <ul class="space-y-1 p-4 text-xs text-muted">
        <li><MessageTime :datetime="hoursAgo(1)" :now="now" /></li>
        <li><MessageTime :datetime="hoursAgo(20)" :now="now" /></li>
        <li><MessageTime :datetime="hoursAgo(60)" :now="now" /></li>
      </ul>
    </Story>
    <Story title="Older Than A Week">
      <ul class="space-y-1 p-4 text-xs text-muted">
        <li><MessageTime datetime="2026-03-12T09:14:00Z" :now="now" /></li>
      </ul>
    </Story>
  </Stories>
</template>
