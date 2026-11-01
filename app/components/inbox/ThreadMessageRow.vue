<script setup lang="ts">
import MessageTime from './MessageTime.vue'
import ParticipantAvatar from './ParticipantAvatar.vue'

const SNIPPET_LENGTH = 140

const { message } = defineProps<{
  message: Inbox.Message
}>()

const { displayName } = useCurrentUser()

const snippet = computed(() => message.body.replaceAll(/\s+/g, ' ').trim().slice(0, SNIPPET_LENGTH))
</script>

<template>
  <!--
    A compact, collapsed message. The thread view makes it the trigger that expands
    the full message, which sets `data-state="open"`: the snippet and time then hide
    because the message below repeats them.
  -->
  <button
    type="button"
    class="group flex w-full items-center gap-3 bg-elevated px-6 py-3 text-left text-xs transition-colors hover:bg-accented/60 focus-visible:focus-ring-inset"
  >
    <ParticipantAvatar :participant="message.from" size="xs" />
    <span class="w-30 shrink-0 truncate font-semibold">{{ displayName(message.from) }}</span>
    <span class="min-w-0 flex-1 truncate text-muted group-data-[state=open]:invisible">
      {{ snippet }}
    </span>
    <MessageTime
      :datetime="message.sentAt"
      class="shrink-0 text-muted group-data-[state=open]:hidden"
    />
    <UIcon
      name="i-lucide-chevron-down"
      class="size-4 shrink-0 text-muted transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
    />
  </button>
</template>
