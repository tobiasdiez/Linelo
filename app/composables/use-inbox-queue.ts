import type { ComputedRef, Ref } from 'vue'
import decisionQueue from '#shared/utils/decision-queue'
import stateKeys from '~/data/state-keys'

/** The first load: one Graph batch round, so the first thread is in the first paint. */
const FIRST_PAGE = 4
/** Background refills ask for more. */
const REFILL_PAGE = 20
/** A refill starts when this few items are left. */
const REFILL_THRESHOLD = 2

/**
 * `idle` before the first load, `failed` when the inbox could not be loaded while
 * nothing was left to decide (the page offers "Try again"), `checking` while an
 * empty queue checks once more before showing Inbox zero.
 */
type QueueStatus = 'idle' | 'ready' | 'checking' | 'failed'

interface ResolveOutcome {
  /** The item that left the queue. */
  item: Inbox.QueueItem
  /** The reply was sent, but its follow-up task could not be created. */
  followUpFailed: boolean
}

interface InboxQueueApi {
  /** The item to decide now, `undefined` at inbox zero. */
  current: ComputedRef<Inbox.QueueItem | undefined>
  status: Readonly<Ref<QueueStatus>>
  /** True while an action is being carried out. */
  resolving: Readonly<Ref<boolean>>
  /** Loads the inbox, once per app session; later calls keep the queue and its undo history. */
  load: () => Promise<void>
  /** Loads the inbox again after the first load failed. */
  retry: () => Promise<void>
  /**
   * Fetches a longer list in the background; everything after the current item
   * follows the server. Resolves to whether that worked.
   */
  refill: () => Promise<boolean>
  /**
   * Carries out the action and advances to the next item. Resolves to
   * `undefined` when there is nothing to report: an action is still in flight,
   * or the user had to leave for sign-in. Rejects when the action failed; the
   * item then stays current.
   */
  resolve: (action: Inbox.TerminalAction) => Promise<ResolveOutcome | undefined>
  /**
   * Brings a resolved item back to the front of the queue at once, then reverts
   * Mark as handled in the mailbox. Rejects when that failed; the item stays.
   */
  undo: (key: string) => Promise<void>
  /** Replaces the whole queue, for example in tests. */
  reset: (items: readonly Inbox.QueueItem[]) => void
}

// Client only: the refill in flight, shared by everything that asks for one
const refills: { inFlight?: Promise<boolean> } = {}

/** The queue of threads waiting for a decision, seeded from the server. */
function useInboxQueue(): InboxQueueApi {
  const state = useState<Inbox.QueueState>(stateKeys.inboxQueue, () => decisionQueue.create([]))
  const status = useState<QueueStatus>(stateKeys.inboxQueueStatus, () => 'idle')
  const resolving = useState(stateKeys.inboxQueueResolving, () => false)
  // During server rendering, forwards the request's cookie
  const requestFetch = useRequestFetch()
  const mail = useMailActions()
  const tasks = useTaskManager()
  const { leaveIfSignedOut } = useSignInRedirect()

  const current = computed(() => decisionQueue.current(state.value))

  async function fetchInbox(limit: number): Promise<Inbox.QueueItem[]> {
    const response = await requestFetch<Inbox.InboxResponse>('/api/inbox', { query: { limit } })
    return response.items
  }

  async function retry(): Promise<void> {
    try {
      const items = await fetchInbox(FIRST_PAGE)
      state.value = decisionQueue.refresh(state.value, items)
      status.value = 'ready'
    } catch (error) {
      if (!(await leaveIfSignedOut(error))) {
        console.error('Loading the inbox failed', error)
        status.value = 'failed'
      }
    }
  }

  async function load(): Promise<void> {
    if (status.value === 'idle') {
      await retry()
    }
  }

  async function refreshFromServer(): Promise<boolean> {
    try {
      // Read the state only once the list is here: the user may have acted meanwhile
      const items = await fetchInbox(REFILL_PAGE)
      state.value = decisionQueue.refresh(state.value, items)
      return true
    } catch (error) {
      // Keep the queue as it is; the next trigger tries again
      if (!(await leaveIfSignedOut(error))) {
        console.error('Refreshing the inbox failed', error)
      }
      return false
    }
  }

  async function refill(): Promise<boolean> {
    if (import.meta.server) {
      return false
    }
    refills.inFlight ??= refreshFromServer().finally(() => {
      refills.inFlight = undefined
    })
    return refills.inFlight
  }

  /** A quiet check instead of a flash of Inbox zero, and no Inbox zero when the check failed. */
  async function checkBeforeInboxZero(): Promise<void> {
    status.value = 'checking'
    const checked = await refill()
    // Not when the check left for sign-in, which reset the state
    if (status.value === 'checking') {
      status.value = checked || state.value.pending.length > 0 ? 'ready' : 'failed'
    }
  }

  function afterResolve(): void {
    const left = state.value.pending.length
    if (left === 0) {
      void checkBeforeInboxZero()
    } else if (left <= REFILL_THRESHOLD) {
      void refill()
    }
  }

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
      state.value = decisionQueue.resolve(state.value, item.key, action.kind)
    } catch (error) {
      if (await leaveIfSignedOut(error)) {
        return undefined
      }
      throw error
    } finally {
      resolving.value = false
    }
    afterResolve()
    // Outside the guard: the next item is usable while the task is still being created
    const followUpCreated = await createFollowUp(item.thread, action)
    return { item, followUpFailed: !followUpCreated }
  }

  async function undo(key: string): Promise<void> {
    const resolution = decisionQueue.resolution(state.value, key)
    if (!resolution) {
      return
    }
    state.value = decisionQueue.undo(state.value, key)
    // TODO: Also delete the task once Add to Todoist is real
    if (resolution.kind !== 'handled') {
      return
    }
    try {
      await mail.markAsUnhandled(resolution.item.thread)
    } catch (error) {
      if (!(await leaveIfSignedOut(error))) {
        throw error
      }
    }
  }

  function reset(items: readonly Inbox.QueueItem[]): void {
    state.value = decisionQueue.create(items)
    status.value = 'ready'
  }

  return {
    current,
    status: readonly(status),
    resolving: readonly(resolving),
    load,
    retry,
    refill,
    resolve,
    undo,
    reset,
  }
}

/** The page sizes, for tests that check what was asked for. */
useInboxQueue.pageSizes = { first: FIRST_PAGE, refill: REFILL_PAGE } as const

export default useInboxQueue
