<script setup lang="ts">
import ReplyComposer from './ReplyComposer.vue'
import inboxBuilders from '~/data/inbox-builders'
import replyAllRecipients from '#shared/utils/reply-all-recipients'

const { mailboxOwner, storyMessage, storySuggestion } = inboxBuilders
const confirm = storySuggestion('thread-vendor-review', 'vendor-review-confirm', 'reply')
const recipients = replyAllRecipients(storyMessage('thread-vendor-review'), mailboxOwner)
// A note to self: the only recipient is the user
const noOne = { to: [], cc: [] }
</script>

<template>
  <Stories title="Inbox/Reply Composer" :component="ReplyComposer">
    <Story title="With Follow-up Task">
      <ReplyComposer
        class="max-w-96"
        :body="confirm.draft"
        :recipients="recipients"
        :follow-up-task="confirm.followUpTask"
      />
    </Story>
    <Story title="Empty Draft">
      <ReplyComposer class="max-w-96" :recipients="recipients" />
    </Story>
    <Story title="Sending">
      <ReplyComposer class="max-w-96" :body="confirm.draft" :recipients="recipients" busy />
    </Story>
    <Story title="No One To Reply To">
      <ReplyComposer class="max-w-96" body="Remember to book the room." :recipients="noOne" />
    </Story>
  </Stories>
</template>
