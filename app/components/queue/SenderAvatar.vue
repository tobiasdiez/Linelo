<script setup lang="ts">
import type { Sender } from '~/types/email'

const props = defineProps<{
  sender: Sender
  size?: 'sm' | 'md' | 'lg'
}>()

// Generate a consistent color based on email
const avatarColor = computed(() => {
  const colors = [
    'bg-linelo-200',
    'bg-amber-200',
    'bg-sky-200',
    'bg-rose-200',
    'bg-violet-200',
    'bg-teal-200',
  ]
  const hash = props.sender.email.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return colors[hash % colors.length]
})

const initials = computed(() => {
  const parts = props.sender.name.split(' ')
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return props.sender.name.substring(0, 2).toUpperCase()
})

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'size-8 text-xs'
    case 'lg':
      return 'size-12 text-base'
    default:
      return 'size-10 text-sm'
  }
})
</script>

<template>
  <div
    v-if="sender.avatarUrl"
    class="rounded-full overflow-hidden"
    :class="sizeClasses"
  >
    <img
      :src="sender.avatarUrl"
      :alt="`${sender.name}'s avatar`"
      class="size-full object-cover"
    >
  </div>
  <div
    v-else
    class="rounded-full flex items-center justify-center font-medium text-warm-700"
    :class="[sizeClasses, avatarColor]"
  >
    {{ initials }}
  </div>
</template>
