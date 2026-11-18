<script setup lang="ts">
import ForwardComposer from './ForwardComposer.vue'
import inboxBuilders from '~/data/inbox-builders'

const { mailboxOwner, participant, storyMessage } = inboxBuilders
const vendorReview = storyMessage('thread-vendor-review')
const staging = storyMessage('thread-staging')
const note = 'Jonas, could you check the hosting numbers before Thursday?'
// Graph names a sender without a display name after the address
const noName = { name: 'no-reply@parcelpost.example', email: 'no-reply@parcelpost.example' }
</script>

<template>
  <Stories title="Inbox/Forward Composer" :component="ForwardComposer">
    <Story title="Empty">
      <ForwardComposer class="max-w-96" :sender="vendorReview.from" has-attachments />
    </Story>
    <Story title="Filled">
      <ForwardComposer
        class="max-w-96"
        :sender="vendorReview.from"
        has-attachments
        recipient="jonas.weber@northwind.co"
        :note="note"
        :participants="[participant('Jonas Weber')]"
      />
    </Story>
    <Story title="Invalid Address">
      <ForwardComposer class="max-w-96" :sender="vendorReview.from" recipient="jonas.weber@" />
    </Story>
    <Story title="Without Attachments">
      <ForwardComposer class="max-w-96" :sender="staging.from" />
    </Story>
    <Story title="Sender Without A Name">
      <ForwardComposer class="max-w-96" :sender="noName" />
    </Story>
    <Story title="Your Own Message">
      <ForwardComposer class="max-w-96" :sender="mailboxOwner" />
    </Story>
    <Story title="Forwarding">
      <ForwardComposer
        class="max-w-96"
        :sender="vendorReview.from"
        has-attachments
        recipient="Jonas Weber <jonas.weber@northwind.co>"
        :note="note"
        busy
      />
    </Story>
  </Stories>
</template>
