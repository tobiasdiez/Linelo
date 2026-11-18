<script setup lang="ts">
import RailActionBar from './RailActionBar.vue'
import isInToasts from '~/utils/is-in-toasts'

const {
  label,
  canSubmit,
  busy = false,
  hint,
} = defineProps<{
  /** The primary button, for example "Send reply". */
  label: string
  /** False while there is nothing to send: the button is disabled and meta+Enter does nothing. */
  canSubmit: boolean
  /**
   * True while sending: the button shows a spinner in place of its shortcut and
   * stays focusable (`aria-disabled`); Back and both keys do nothing.
   */
  busy?: boolean
  /** One line below the buttons, for example "Sending resolves this message." */
  hint: string
}>()

const emit = defineEmits<{
  submit: []
  back: []
}>()

const appConfig = useAppConfig()
const { macOS } = useKbd()
const submitShortcut = computed(() => (macOS.value ? 'Meta+Enter' : 'Control+Enter'))

function submit(): void {
  if (canSubmit && !busy) {
    emit('submit')
  }
}

// Stay in the composer while sending: if sending fails, the draft is still here
function back(): void {
  if (!busy) {
    emit('back')
  }
}

/*
 * Escape pressed in a toast (reached with F8 or Tab) is for that toast. The
 * shortcut is left out while focus is there: once it matches, it marks the event
 * as handled, and Reka then keeps the toast open.
 */
const focusInToasts = ref(false)

function onFocusIn(event: FocusEvent): void {
  focusInToasts.value = isInToasts(event.target)
}

function onFocusOut(event: FocusEvent): void {
  focusInToasts.value = isInToasts(event.relatedTarget)
}

onMounted(() => {
  document.addEventListener('focusin', onFocusIn)
  document.addEventListener('focusout', onFocusOut)
})
onBeforeUnmount(() => {
  document.removeEventListener('focusin', onFocusIn)
  document.removeEventListener('focusout', onFocusOut)
})

// Both work while typing, which is where they are needed
defineShortcuts(
  computed(() => ({
    ...(focusInToasts.value ? {} : { escape: { usingInput: true, handler: shortcut(back) } }),
    meta_enter: { usingInput: true, handler: shortcut(submit) },
  })),
)
</script>

<template>
  <RailActionBar>
    <!-- The spinner takes the shortcut's place, so the label never moves -->
    <UButton
      :label="label"
      color="primary"
      variant="solid"
      size="lg"
      block
      class="justify-between"
      :disabled="!canSubmit"
      :aria-disabled="busy || undefined"
      :data-pending="busy || undefined"
      :aria-keyshortcuts="submitShortcut"
      @click="submit"
    >
      <template #trailing>
        <UIcon
          v-if="busy"
          :name="appConfig.ui.icons.loading"
          class="size-5 motion-safe:animate-spin"
        />
        <span v-else aria-hidden="true" class="flex gap-0.5 max-sm:hidden">
          <UKbd value="meta" color="primary" variant="solid" />
          <UKbd value="enter" color="primary" variant="solid" />
        </span>
      </template>
    </UButton>
    <UButton
      label="Back"
      size="lg"
      block
      class="justify-between"
      aria-keyshortcuts="Escape"
      :disabled="busy"
      @click="back"
    >
      <template #trailing>
        <UKbd value="escape" aria-hidden="true" class="max-sm:hidden" />
      </template>
    </UButton>
    <template #hint>
      <p class="mt-2 text-center text-xs text-muted">{{ hint }}</p>
    </template>
  </RailActionBar>
</template>
