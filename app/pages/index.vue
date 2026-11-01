<script setup lang="ts">
import InboxScreen from '~/components/inbox/InboxScreen.vue'
import InboxZero from '~/components/inbox/InboxZero.vue'
import formatRecipients from '~/utils/format-recipients'

type ToastOptions = Parameters<ReturnType<typeof useToast>['add']>[0]
type ToastAction = NonNullable<ToastOptions['actions']>[number]

const { current, resolving, resolve, undo } = useInboxQueue()
const toast = useToast()
const mainElement = useTemplateRef<HTMLElement>('mainElement')

// After every swap, focus the new heading so keyboard and screen reader users land on it
watch(
  () => current.value?.thread.id,
  () => {
    mainElement.value?.querySelector('h1')?.focus()
  },
  { flush: 'post' },
)

// Longer than other toasts: Undo is the only way back from an instant action
const UNDO_TOAST_DURATION = 8000

function undoAction(item: Inbox.QueueItem): ToastAction {
  return { label: 'Undo', onClick: () => undo(item.thread.id) }
}

/**
 * Reka closes every toast on Escape, wherever it is pressed (for example to leave
 * the composer). An Undo toast only closes on Escape pressed inside the toasts.
 */
function keepOnOutsideEscape(event: KeyboardEvent): void {
  const { target } = event
  if (!(target instanceof Element && target.closest('[data-slot="viewport"]'))) {
    event.preventDefault()
  }
}

function withUndo(item: Inbox.QueueItem, options: ToastOptions): ToastOptions {
  return {
    ...options,
    actions: [undoAction(item)],
    duration: UNDO_TOAST_DURATION,
    onEscapeKeyDown: keepOnOutsideEscape,
  }
}

function confirmation(item: Inbox.QueueItem, action: Inbox.TerminalAction): ToastOptions {
  switch (action.kind) {
    case 'reply': {
      const { summary } = formatRecipients(action)
      return {
        title: summary ? `Replied to ${summary}` : 'Reply sent',
        description: action.followUpTask
          ? `Also added to Todoist: ${action.followUpTask.title}`
          : undefined,
      }
    }
    case 'handled': {
      return withUndo(item, { title: 'Marked as handled', description: item.thread.subject })
    }
    case 'delegate': {
      return { title: `Forwarded to ${action.to.name}` }
    }
    case 'task': {
      return withUndo(item, { title: 'Added to Todoist', description: action.task.title })
    }
  }
}

function failure(action: Inbox.TerminalAction): ToastOptions {
  const titles: Record<Inbox.TerminalAction['kind'], string> = {
    reply: "Couldn't send the reply. Your draft is still here.",
    handled: "Couldn't mark this as handled. Try again.",
    delegate: "Couldn't forward this message. Try again.",
    task: "Couldn't add the task to Todoist. Try again.",
  }
  return { title: titles[action.kind], color: 'error', icon: 'i-lucide-circle-alert' }
}

const followUpFailure: ToastOptions = {
  title: 'Reply sent',
  description: "Couldn't add the task to Todoist.",
  color: 'error',
  icon: 'i-lucide-circle-alert',
}

async function onResolve(action: Inbox.TerminalAction): Promise<void> {
  const outcome = await resolve(action).catch((error: unknown) => {
    console.error('Resolving the message failed', error)
    toast.add(failure(action))
    return undefined
  })
  if (outcome) {
    toast.add(outcome.followUpFailed ? followUpFailure : confirmation(outcome.item, action))
  }
}

function onDelegate(): void {
  // TODO: Open a forward composer in the rail once delegating is built
  // A fixed id, so pressing D again replaces the notice instead of stacking copies
  toast.add({ id: 'delegate-unavailable', title: "Delegating isn't available yet." })
}
</script>

<template>
  <div class="min-h-dvh">
    <AppHeader />
    <main ref="mainElement">
      <InboxScreen
        v-if="current"
        :key="current.thread.id"
        :item="current"
        :busy="resolving"
        @resolve="onResolve"
        @delegate="onDelegate"
      />
      <InboxZero v-else />
    </main>
  </div>
</template>
