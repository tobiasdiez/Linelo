<script setup lang="ts">
const { text } = defineProps<{
  /** One line explaining why the message is shown now. */
  text: string
}>()

const open = ref(false)
</script>

<template>
  <!-- Opens on hover and focus; a click or tap only opens it as well, since tooltips ignore touch -->
  <UTooltip
    v-model:open="open"
    :text="text"
    :content="{ side: 'bottom', align: 'start' }"
    disable-closing-trigger
  >
    <UButton
      icon="i-lucide-info"
      color="neutral"
      variant="ghost"
      size="xs"
      aria-label="Why this message is shown now"
      class="-my-1 text-muted"
      @click="open = true"
    />
  </UTooltip>
</template>
