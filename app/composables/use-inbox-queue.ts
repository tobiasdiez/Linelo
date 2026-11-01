import type { ComputedRef, Ref } from 'vue'
import createInboxFixtures from '~/data/inbox-fixtures'
import decisionQueue from '#shared/utils/decision-queue'

interface ResolveOutcome {
  /** The item that left the queue. */
  item: Inbox.QueueItem
  /** The reply was sent, but its follow-up task could not be created. */
  followUpFailed: boolean
}

interface InboxQueueApi {
  /** The item to decide now, `undefined` at inbox zero. */
  current: ComputedRef<Inbox.QueueItem | undefined>
  /** True while an action is being carried out. */
  resolving: Readonly<Ref<boolean>>
  /**
   * Carries out the action and advances to the next item. Resolves to
   * `undefined` when nothing was done because an action is still in flight.
   * Rejects when the action failed; the item then stays current.
   */
  resolve: (action: Inbox.TerminalAction) => Promise<ResolveOutcome | undefined>
  /** Brings a resolved item back to the front of the queue. */
  undo: (threadId: string) => void
  /** Replaces the whole queue, for example after loading a fresh inbox. */
  reset: (items: readonly Inbox.QueueItem[]) => void
}

/**
 * The queue of threads waiting for a decision.
 * TODO: Seed from the ranked Microsoft inbox once ingestion exists.
 */
function useInboxQueue(): InboxQueueApi {
  const state = useState<Inbox.QueueState>('inbox-queue', () =>
    decisionQueue.create(createInboxFixtures()),
  )
  const resolving = useState('inbox-queue-resolving', () => false)
  const mail = useMailActions()
  const tasks = useTaskManager()

  const current = computed(() => decisionQueue.current(state.value))

  async function carryOut(thread: Inbox.Thread, action: Inbox.TerminalAction): Promise<void> {
    switch (action.kind) {
      case 'reply': {
        await mail.sendReply(thread, { body: action.body, to: action.to, cc: action.cc })
        return
      }
      case 'handled': {
        await mail.markAsHandled(thread)
        return
      }
      case 'delegate': {
        await mail.forward(thread, action.to, action.note)
        return
      }
      case 'task': {
        await tasks.createTask({ ...action.task, threadId: thread.id })
      }
    }
  }

  /** Best effort: the reply is already sent, so a failure here must not undo or repeat it. */
  async function createFollowUp(
    thread: Inbox.Thread,
    action: Inbox.TerminalAction,
  ): Promise<boolean> {
    if (action.kind !== 'reply' || !action.followUpTask) {
      return true
    }
    try {
      await tasks.createTask({ ...action.followUpTask, threadId: thread.id })
      return true
    } catch (error) {
      console.error('Creating the follow-up task failed', error)
      return false
    }
  }

  async function resolve(action: Inbox.TerminalAction): Promise<ResolveOutcome | undefined> {
    const item = current.value
    if (!item || resolving.value) {
      return undefined
    }
    resolving.value = true
    try {
      await carryOut(item.thread, action)
      state.value = decisionQueue.resolve(state.value, item.thread.id)
    } finally {
      resolving.value = false
    }
    // Outside the guard: the next item is usable while the task is still being created
    const followUpCreated = await createFollowUp(item.thread, action)
    return { item, followUpFailed: !followUpCreated }
  }

  function undo(threadId: string): void {
    // TODO: Also revert the side effect (mark unread, delete the task) once the adapters are real.
    state.value = decisionQueue.undo(state.value, threadId)
  }

  function reset(items: readonly Inbox.QueueItem[]): void {
    state.value = decisionQueue.create(items)
  }

  return { current, resolving: readonly(resolving), resolve, undo, reset }
}

export default useInboxQueue
