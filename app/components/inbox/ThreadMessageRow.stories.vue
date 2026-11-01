<script setup lang="ts">
import { UCard, UCollapsible } from '#components'
import MessageView from './MessageView.vue'
import ThreadMessageRow from './ThreadMessageRow.vue'
import inboxBuilders from '~/data/inbox-builders'

const fromLena = inboxBuilders.storyMessage('thread-vendor-review', 0)
const fromMe = inboxBuilders.storyMessage('thread-vendor-review', 1)
</script>

<template>
  <Stories title="Inbox/Thread Message Row" :component="ThreadMessageRow">
    <Story title="Collapsed">
      <UCard variant="flush" class="max-w-2xl">
        <UCollapsible class="border-b border-default">
          <ThreadMessageRow :message="fromLena" />
          <template #content>
            <MessageView :message="fromLena" />
          </template>
        </UCollapsible>
      </UCard>
    </Story>
    <Story title="Expanded">
      <UCard variant="flush" class="max-w-2xl">
        <UCollapsible default-open class="border-b border-default">
          <ThreadMessageRow :message="fromMe" />
          <template #content>
            <MessageView :message="fromMe" />
          </template>
        </UCollapsible>
      </UCard>
    </Story>
  </Stories>
</template>
