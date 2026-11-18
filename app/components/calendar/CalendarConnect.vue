<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
import FocusableTitle from '~/utils/focusable-title'

const { notice = undefined, busy = false } = defineProps<{
  /** What happened on Microsoft's page, when the user came back from it. */
  notice?: Session.ConnectNotice
  /** True while handing over to Microsoft. */
  busy?: boolean
}>()

const emit = defineEmits<{
  allow: []
}>()

const root = useTemplateRef<HTMLElement>('root')
const noticeRegion = useTemplateRef<HTMLElement>('noticeRegion')

const actions = computed<ButtonProps[]>(() => [
  {
    label: 'Allow calendar access',
    color: 'primary',
    variant: 'solid',
    size: 'lg',
    loading: busy,
    onClick: () => emit('allow'),
  },
])

// Back from Microsoft with a notice, it is read out; otherwise the title is
onMounted(() => {
  if (notice) {
    noticeRegion.value?.focus()
  } else {
    root.value?.querySelector('h1')?.focus()
  }
})

// A failed start comes back as a notice while the page stays: read it out
watch(
  () => notice,
  async value => {
    if (value) {
      await nextTick()
      noticeRegion.value?.focus()
    }
  },
)
</script>

<template>
  <div ref="root" class="mx-auto max-w-xl px-6 py-24 motion-safe:animate-fade-in">
    <UEmpty
      :as="{ title: FocusableTitle }"
      title="Linelo doesn't have access to your calendar."
      description="Linelo shows your calendar and suggests events from other calendars in it, one decision each. Microsoft asks you to allow calendar access first."
      :actions="actions"
      variant="naked"
      size="xl"
    />
    <!-- Polite: the notice explains what happened, it does not interrupt -->
    <div ref="noticeRegion" role="status" tabindex="-1" class="text-center outline-none">
      <p v-if="notice === 'cancelled'" class="text-sm text-muted">
        Allowing access was cancelled. Continue whenever you're ready.
      </p>
      <UAlert
        v-else-if="notice === 'failed'"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        description="That didn't work. Try again."
        class="text-left"
      />
    </div>
  </div>
</template>
