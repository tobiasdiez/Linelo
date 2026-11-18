<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import RailActionBar from './RailActionBar.vue'
import RailHeading from './RailHeading.vue'
import decisionActions from '~/data/decision-actions'

const { busy = false, pending = undefined } = defineProps<{
  /**
   * Blocks the actions, and their keys, while one is being carried out. They stay
   * focusable (`aria-disabled`), so focus stays on the action that was pressed.
   */
  busy?: boolean
  /** The action being carried out, shown with a spinner. */
  pending?: Inbox.TerminalAction['kind']
}>()

const appConfig = useAppConfig()

const emit = defineEmits<{
  action: [kind: Inbox.TerminalAction['kind']]
}>()

const headingId = useId()
const buttons = new Map<Inbox.TerminalAction['kind'], HTMLElement>()

function setButton(
  kind: Inbox.TerminalAction['kind'],
  instance: Element | ComponentPublicInstance | null,
): void {
  const element: unknown = instance && '$el' in instance ? instance.$el : instance
  if (element instanceof HTMLElement) {
    buttons.set(kind, element)
  } else {
    buttons.delete(kind)
  }
}

/** Moves focus to the action's button, for example when the composer it opened closes. */
function focusAction(kind: Inbox.TerminalAction['kind']): void {
  buttons.get(kind)?.focus()
}

function act(kind: Inbox.TerminalAction['kind']): void {
  if (!busy) {
    emit('action', kind)
  }
}

// `act` ignores them while busy
defineShortcuts(
  Object.fromEntries(decisionActions.map(action => [action.key, shortcut(() => act(action.kind))])),
)

defineExpose({ focusAction })
</script>

<template>
  <section :aria-labelledby="headingId">
    <RailHeading :heading-id="headingId" class="max-lg:sr-only">Decide</RailHeading>
    <RailActionBar>
      <UButton
        v-for="action in decisionActions"
        :key="action.kind"
        :ref="instance => setButton(action.kind, instance)"
        :label="action.label"
        :color="action.primary ? 'primary' : 'neutral'"
        :variant="action.primary ? 'solid' : 'outline'"
        size="lg"
        block
        class="justify-between"
        :aria-keyshortcuts="action.key.toUpperCase()"
        :aria-disabled="busy || undefined"
        :data-pending="pending === action.kind || undefined"
        @click="act(action.kind)"
      >
        <template #trailing>
          <UIcon
            v-if="pending === action.kind"
            :name="appConfig.ui.icons.loading"
            class="size-5 motion-safe:animate-spin"
          />
          <UKbd
            v-else
            :value="action.key.toUpperCase()"
            :color="action.primary ? 'primary' : 'neutral'"
            :variant="action.primary ? 'solid' : 'outline'"
            aria-hidden="true"
            class="max-sm:hidden"
          />
        </template>
      </UButton>
    </RailActionBar>
  </section>
</template>
