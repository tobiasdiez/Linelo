<script setup lang="ts">
import MessageView from './MessageView.vue'
import { UCard } from '#components'
import inboxBuilders from '~/data/inbox-builders'

const withAttachment = inboxBuilders.storyMessage('thread-vendor-review')
const short = inboxBuilders.storyMessage('thread-staging')
const longLink = inboxBuilders.storyMessage('thread-delivery')
const noText = inboxBuilders.storyMessage('thread-scan')
const noAddress = inboxBuilders.message({
  from: { name: 'Unknown sender', email: '' },
  body: 'Sent from a system that did not give its address.',
})
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
    <Story title="Long Link">
      <UCard variant="flush" class="max-w-md">
        <MessageView :message="longLink" />
      </UCard>
    </Story>
    <Story title="No Text">
      <UCard variant="flush" class="max-w-2xl">
        <MessageView :message="noText" />
      </UCard>
    </Story>
    <Story title="Sender Without Address">
      <UCard variant="flush" class="max-w-2xl">
        <MessageView :message="noAddress" />
      </UCard>
    </Story>
  </Stories>
</template>
