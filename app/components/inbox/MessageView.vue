<script setup lang="ts">
import MessageTime from './MessageTime.vue'
import ParticipantAvatar from './ParticipantAvatar.vue'

const BYTES_PER_KILOBYTE = 1024
const BYTES_PER_MEGABYTE = BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE

const { message } = defineProps<{
  message: Inbox.Message
}>()

const { displayName, listNames } = useCurrentUser()

// TODO: Render the HTML body once Microsoft Graph ingestion lands
const paragraphs = computed(() =>
  message.body
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(paragraph => paragraph.length > 0),
)

function formatSize(bytes: number): string {
  if (bytes >= BYTES_PER_MEGABYTE) {
    return `${(bytes / BYTES_PER_MEGABYTE).toFixed(1)} MB`
  }
  return `${Math.max(1, Math.round(bytes / BYTES_PER_KILOBYTE))} KB`
}
</script>

<template>
  <article class="p-6">
    <header class="flex items-center gap-3.5">
      <ParticipantAvatar :participant="message.from" size="2xl" />
      <div class="min-w-0 flex-1">
        <p class="font-semibold">{{ displayName(message.from) }}</p>
        <p class="text-xs text-muted">
          {{ message.from.email }} · to {{ listNames([...message.to, ...message.cc]) }}
        </p>
      </div>
      <MessageTime :datetime="message.sentAt" class="shrink-0 self-start text-xs text-muted" />
    </header>

    <div class="mt-5 space-y-3.5 text-toned">
      <p v-for="(paragraph, index) in paragraphs" :key="index" class="whitespace-pre-line">
        {{ paragraph }}
      </p>
    </div>

    <ul
      v-if="message.attachments.length > 0"
      aria-label="Attachments"
      class="mt-5 flex flex-wrap gap-2"
    >
      <li
        v-for="attachment in message.attachments"
        :key="attachment.id"
        class="inline-flex items-center gap-2 rounded-md border border-default bg-elevated py-1.5 ps-2.5 pe-3 text-xs font-medium text-toned"
      >
        <UIcon name="i-lucide-paperclip" class="size-3.5 text-muted" />
        {{ attachment.name }}
        <span class="font-normal text-muted">{{ formatSize(attachment.sizeBytes) }}</span>
      </li>
    </ul>
  </article>
</template>
