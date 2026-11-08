<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
import FocusableTitle from '~/utils/focusable-title'

const { state, busy = false } = defineProps<{
  /** `checking`: an empty queue looks once more for new mail. `failed`: the inbox did not load. */
  state: 'checking' | 'failed'
  /** True while trying again. */
  busy?: boolean
}>()

const emit = defineEmits<{
  retry: []
}>()

const root = useTemplateRef<HTMLElement>('root')
/** Trying again failed too; said in a status line, so it does not go unnoticed. */
const stillFailing = ref(false)

const title = computed(() =>
  state === 'checking' ? 'Checking for new mail.' : "Your inbox didn't load.",
)
const description = computed(() =>
  state === 'failed' ? "Linelo couldn't reach your mailbox just now." : undefined,
)
const actions = computed<ButtonProps[]>(() =>
  state === 'failed'
    ? [
        {
          label: 'Try again',
          color: 'primary',
          variant: 'solid',
          size: 'lg',
          loading: busy,
          onClick: () => emit('retry'),
        },
      ]
    : [],
)

// Shown in place of the message being decided: announce it by moving focus to its title
onMounted(() => {
  root.value?.querySelector('h1')?.focus()
})

// The button is disabled while trying again, which drops focus: give it back after a failure
watch(
  () => busy,
  async (isBusy, wasBusy) => {
    if (isBusy || !wasBusy || state !== 'failed') {
      return
    }
    stillFailing.value = true
    await nextTick()
    root.value?.querySelector('button')?.focus()
  },
)
</script>

<template>
  <!-- In place of the decision screen -->
  <div ref="root" class="mx-auto max-w-xl px-6 py-24 motion-safe:animate-fade-in">
    <UEmpty
      :as="{ title: FocusableTitle }"
      :title="title"
      :description="description"
      :actions="actions"
      variant="naked"
      size="xl"
    />
    <p role="status" class="text-center text-sm text-muted">
      <template v-if="stillFailing && state === 'failed'">Still can't reach your mailbox.</template>
    </p>
  </div>
</template>
