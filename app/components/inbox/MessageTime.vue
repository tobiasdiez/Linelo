<script setup lang="ts">
import formatMessageTime from '~/utils/format-message-time'

const { datetime, now = undefined } = defineProps<{
  /** ISO 8601 timestamp. */
  datetime: string
  /** Reference time in milliseconds; the current time unless pinned, for example in stories. */
  now?: number
}>()

const date = computed(() => new Date(datetime))
const isValid = computed(() => !Number.isNaN(date.value.getTime()))
const label = computed(() =>
  isValid.value ? formatMessageTime.short(date.value, new Date(now ?? Date.now())) : datetime,
)

// The full date is only a hover detail, so it is added after hydration instead of risking a mismatch
const isMounted = ref(false)
onMounted(() => {
  isMounted.value = true
})
const fullDate = computed(() =>
  isMounted.value && isValid.value ? formatMessageTime.full(date.value) : undefined,
)
</script>

<template>
  <!-- The label depends on the viewer's time zone; hydration replaces the server's text -->
  <time
    :datetime="isValid ? date.toISOString() : undefined"
    :title="fullDate"
    data-allow-mismatch="text"
  >
    {{ label }}
  </time>
</template>
