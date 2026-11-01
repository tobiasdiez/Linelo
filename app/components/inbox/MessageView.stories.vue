<script setup lang="ts">
import MessageView from './MessageView.vue'
import { UCard } from '#components'
import inboxBuilders from '~/data/inbox-builders'

const withAttachment = inboxBuilders.storyMessage('thread-vendor-review')
const short = inboxBuilders.storyMessage('thread-staging')
</script>

<template>
  <Stories title="Inbox/Message View" :component="MessageView">
    <Story title="With Attachment">
      <UCard variant="flush" class="max-w-2xl">
        <MessageView :message="withAttachment" />
      </UCard>
    </Story>
    <Story title="Short">
      <UCard variant="flush" class="max-w-2xl">
        <MessageView :message="short" />
      </UCard>
    </Story>
  </Stories>
</template>
