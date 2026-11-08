<script setup lang="ts">
import InboxScreen from '~/components/inbox/InboxScreen.vue'
import InboxStatus from '~/components/inbox/InboxStatus.vue'
import InboxZero from '~/components/inbox/InboxZero.vue'
import formatRecipients from '~/utils/format-recipients'

type ToastOptions = Parameters<ReturnType<typeof useToast>['add']>[0]
type ToastAction = NonNullable<ToastOptions['actions']>[number]
type StubbedAction = Exclude<Inbox.TerminalAction['kind'], 'handled'>

const queue = useInboxQueue()
const { current, status, resolving, resolve, undo } = queue
const toast = useToast()
const mainElement = useTemplateRef<HTMLElement>('mainElement')
const retrying = ref(false)

// During server rendering, so the first thread is in the first paint
await queue.load()

// Then a longer list in the background, for everything after the first thread
onMounted(() => {
  if (current.value) {
    void queue.refill()
  }
})

// After every swap, focus the new heading so keyboard and screen reader users land on it
watch(
  () => current.value?.key ?? status.value,
  () => {
    mainElement.value?.querySelector('h1')?.focus()
  },
  { flush: 'post' },
)

// Longer than other toasts: Undo is the only way back from an instant action
const UNDO_TOAST_DURATION = 8000

const errorIcon = 'i-lucide-circle-alert'

/** Mark as handled is the only action that resolves an item for now. */
const unavailable: Record<StubbedAction, string> = {
  reply: "Replying isn't available yet.",
  delegate: "Delegating isn't available yet.",
  task: "Adding to Todoist isn't available yet.",
}

async function onUndo(item: Inbox.QueueItem): Promise<void> {
  try {
    await undo(item.key)
  } catch (error) {
    console.error('Undoing failed', error)
    toast.add({ title: "Couldn't mark this as unread again.", color: 'error', icon: errorIcon })
  }
}

function undoAction(item: Inbox.QueueItem): ToastAction {
  return {
    label: 'Undo',
    onClick: () => {
      void onUndo(item)
    },
  }
}

/**
 * Reka closes every toast on Escape, wherever it is pressed (for example to leave
 * the composer). An Undo toast only closes on Escape pressed inside the toasts.
 * Menus see that Escape as handled and close themselves (`AppHeader`).
 */
function keepOnOutsideEscape(event: KeyboardEvent): void {
  const { target } = event
  // The toasts' own list, inside their region (menus have a viewport of the same name)
  if (!(target instanceof Element && target.closest('[role="region"] [data-slot="viewport"]'))) {
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

// The reply, delegate and task confirmations wait for those actions to become real
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
  return { title: titles[action.kind], color: 'error', icon: errorIcon }
}

const followUpFailure: ToastOptions = {
  title: 'Reply sent',
  description: "Couldn't add the task to Todoist.",
  color: 'error',
  icon: errorIcon,
}

function showUnavailable(kind: StubbedAction): void {
  // TODO: Send replies, forward and create tasks once Mail.Send and Todoist are connected
  // A fixed id per action, so pressing the key again replaces the notice instead of stacking copies
  toast.add({ id: `${kind}-unavailable`, title: unavailable[kind] })
}

async function onResolve(action: Inbox.TerminalAction): Promise<void> {
  if (action.kind !== 'handled') {
    showUnavailable(action.kind)
    return
  }
  const outcome = await resolve(action).catch((error: unknown) => {
    console.error('Resolving the message failed', error)
    toast.add(failure(action))
    return undefined
  })
  if (outcome) {
    toast.add(outcome.followUpFailed ? followUpFailure : confirmation(outcome.item, action))
  }
}

async function onRetry(): Promise<void> {
  retrying.value = true
  try {
    await queue.retry()
  } finally {
    retrying.value = false
  }
  // As after the first paint: the longer list in the background
  if (current.value) {
    void queue.refill()
  }
}
</script>

<template>
  <div class="min-h-dvh">
    <AppHeader />
    <main ref="mainElement">
      <InboxScreen
        v-if="current"
        :key="current.key"
        :item="current"
        :busy="resolving"
        @resolve="onResolve"
        @delegate="showUnavailable('delegate')"
      />
      <InboxStatus v-else-if="status === 'checking'" state="checking" />
      <InboxStatus
        v-else-if="status === 'failed'"
        state="failed"
        :busy="retrying"
        @retry="onRetry"
      />
      <!-- Nothing while the inbox is not loaded, for example on the way to sign-in -->
      <InboxZero v-else-if="status === 'ready'" />
    </main>
  </div>
</template>
