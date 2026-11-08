<script setup lang="ts">
import ParticipantAvatar from './ParticipantAvatar.vue'
import inboxBuilders from '~/data/inbox-builders'

const lena = inboxBuilders.participant('Lena Hartmann')
const { mailboxOwner } = inboxBuilders
</script>

<template>
  <Stories title="Inbox/Participant Avatar" :component="ParticipantAvatar">
    <Story title="Someone Else">
      <div class="flex items-center gap-3 p-4">
        <ParticipantAvatar :participant="lena" size="xs" />
        <ParticipantAvatar :participant="lena" />
        <ParticipantAvatar :participant="lena" size="2xl" />
      </div>
    </Story>
    <Story title="Current User">
      <div class="flex items-center gap-3 p-4">
        <ParticipantAvatar :participant="mailboxOwner" size="xs" />
        <ParticipantAvatar :participant="mailboxOwner" />
        <ParticipantAvatar :participant="mailboxOwner" size="2xl" />
      </div>
    </Story>
  </Stories>
</template>
