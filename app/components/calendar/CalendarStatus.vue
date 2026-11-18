<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
import FocusableTitle from '~/utils/focusable-title'

const { busy = false } = defineProps<{
  /** True while trying again. */
  busy?: boolean
}>()

const emit = defineEmits<{
  retry: []
}>()

const root = useTemplateRef<HTMLElement>('root')
/** Trying again failed too; said in a status line, so it does not go unnoticed. */
const stillFailing = ref(false)

const actions = computed<ButtonProps[]>(() => [
  {
    label: 'Try again',
    color: 'primary',
    variant: 'solid',
    size: 'lg',
    loading: busy,
    onClick: () => emit('retry'),
  },
])

// In place of the week: announce it by moving focus to its title
onMounted(() => {
  root.value?.querySelector('h1')?.focus()
})

// The button is disabled while trying again, which drops focus: give it back after a failure
watch(
  () => busy,
  async (isBusy, wasBusy) => {
    if (isBusy || !wasBusy) {
      return
    }
    stillFailing.value = true
    await nextTick()
    root.value?.querySelector('button')?.focus()
  },
)
</script>

<template>
  <div ref="root" class="mx-auto max-w-xl px-6 py-24 motion-safe:animate-fade-in">
    <UEmpty
      :as="{ title: FocusableTitle }"
      title="Your calendar didn't load."
      description="Linelo couldn't reach your calendar just now."
      :actions="actions"
      variant="naked"
      size="xl"
    />
    <p role="status" class="text-center text-sm text-muted">
      <template v-if="stillFailing">Still can't reach your calendar.</template>
    </p>
  </div>
</template>
