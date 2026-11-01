<script setup lang="ts">
import MessageComposer from './MessageComposer.vue'
import inboxBuilders from '~/data/inbox-builders'
import latestMessage from '#shared/utils/latest-message'
import replyAllRecipients from '#shared/utils/reply-all-recipients'

const { currentUser, storyItem, storySuggestion } = inboxBuilders
const confirm = storySuggestion('thread-vendor-review', 'vendor-review-confirm', 'reply')
const recipients = replyAllRecipients(
  latestMessage(storyItem('thread-vendor-review').thread),
  currentUser,
)
</script>

<template>
  <Stories title="Inbox/Message Composer" :component="MessageComposer">
    <Story title="With Follow-up Task">
      <MessageComposer
        class="max-w-96"
        :body="confirm.draft"
        :recipients="recipients"
        :follow-up-task="confirm.followUpTask"
      />
    </Story>
    <Story title="Empty Draft">
      <MessageComposer class="max-w-96" :recipients="recipients" />
    </Story>
    <Story title="Sending">
      <MessageComposer class="max-w-96" :body="confirm.draft" :recipients="recipients" busy />
    </Story>
  </Stories>
</template>
