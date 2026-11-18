<script setup lang="ts">
import InboxScreen from '~/components/inbox/InboxScreen.vue'
import InboxStatus from '~/components/inbox/InboxStatus.vue'
import InboxZero from '~/components/inbox/InboxZero.vue'
import actionFeedback from '~/data/action-feedback'

type ToastAction = NonNullable<Parameters<ReturnType<typeof useToast>['add']>[0]['actions']>[number]

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

async function onUndo(item: Inbox.QueueItem): Promise<void> {
  try {
    await undo(item.key)
  } catch (error) {
    console.error('Undoing failed', error)
    toast.add(actionFeedback.undoFailure)
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

async function onResolve(action: Inbox.TerminalAction): Promise<void> {
  const item = current.value
  if (!item) {
    return
  }
  if (action.kind === 'task') {
    toast.add(actionFeedback.taskUnavailable)
    return
  }
  const outcome = await resolve(action).catch((error: unknown) => {
    console.error('Resolving the message failed', error)
    toast.add(actionFeedback.failure(item, action, error))
    return undefined
  })
  if (outcome) {
    // Sent after all: an earlier failure of this action no longer applies. Only one
    // That is shown: removing schedules the id's cleanup even when there is none
    const failureId = actionFeedback.failureId(outcome.item, action.kind)
    if (failureId !== undefined && toast.toasts.value.some(entry => entry.id === failureId)) {
      toast.remove(failureId)
    }
    toast.add(
      outcome.followUpFailed
        ? actionFeedback.followUpFailure
        : actionFeedback.confirmation(outcome.item, action, undoAction(outcome.item)),
    )
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
