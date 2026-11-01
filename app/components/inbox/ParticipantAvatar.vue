<script setup lang="ts">
const { participant, size = 'md' } = defineProps<{
  participant: Inbox.Participant
  size?: 'xs' | 'md' | '2xl'
}>()

const { isMe } = useCurrentUser()
</script>

<template>
  <!-- Decorative: the participant's name always follows -->
  <UAvatar
    :alt="participant.name"
    :color="isMe(participant) ? 'neutral' : 'primary'"
    :size="size"
    aria-hidden="true"
  />
</template>
