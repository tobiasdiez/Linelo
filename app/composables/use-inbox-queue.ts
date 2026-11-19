import type { ComputedRef, Ref } from 'vue'
import decisionQueue from '#shared/utils/decision-queue'
import sessionScoped from '~/utils/session-scoped'
import stateKeys from '~/data/state-keys'

/** The first load: one Graph batch round, so the first thread is in the first paint. */
const FIRST_PAGE = 4
/** Background refills ask for more. */
const REFILL_PAGE = 20
/** A refill starts when this few items are left. */
const REFILL_THRESHOLD = 2
/** A check before Inbox zero that ends this soon shows nothing in between, so it does not flash; the specs set it. */
const timing = { quietCheckMs: 300 }

/**
 * `idle` before the first load, `failed` when the inbox could not be loaded while
 * nothing was left to decide (the page offers "Try again"), `checking` while the
 * newest mail is read first (the starting batch) or an empty queue checks for new mail
 * before showing Inbox zero, `waiting` during the first moments of that check, when
 * nothing is shown.
 */
type QueueStatus = 'idle' | 'ready' | 'checking' | 'waiting' | 'failed'

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
  /** Failed again after "Try again". */
  stillFailing: ComputedRef<boolean>
  /** True while an action is being carried out. */
  resolving: Readonly<Ref<boolean>>
  /**
   * Loads the inbox, once per app session; later calls keep the queue and its undo
   * history. With nothing worth showing yet, the status is `checking` and `resume`
   * reads the newest mail first.
   */
  load: () => Promise<void>
  /** Loads the inbox again after the first load failed. */
  retry: () => Promise<void>
  /**
   * After the first paint and on every return to the page (client only): the starting
   * batch when the first answer had nothing to show; otherwise a refill when the queue is
   * short, and a sync with a refill after it when the last sync is stale.
   */
  resume: () => void
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

/** The refill and the starting batch in flight, shared by everything that asks for one. */
interface InFlight {
  refill?: Promise<boolean>
  preparing?: Promise<void>
}

// Client only: what the current session has in flight; a new session starts with nothing
const inFlightOf = sessionScoped<InFlight>(() => ({}))

/** The queue of threads waiting for a decision, seeded from the server. */
function useInboxQueue(): InboxQueueApi {
  const state = useState<Inbox.QueueState>(stateKeys.inboxQueue, () => decisionQueue.create([]))
  const status = useState<QueueStatus>(stateKeys.inboxQueueStatus, () => 'idle')
  const resolving = useState(stateKeys.inboxQueueResolving, () => false)
  const preparing = useState(stateKeys.inboxQueuePreparing, () => false)
  const retried = useState(stateKeys.inboxQueueRetried, () => false)
  const refilled = useState(stateKeys.inboxQueueRefilled, () => false)
  const session = useState(stateKeys.inboxSession, sessionScoped.newSession)
  // During server rendering, forwards the request's cookie
  const requestFetch = useRequestFetch()
  const sync = useInboxSync()
  const mail = useMailActions()
  const tasks = useTaskManager()
  const { leaveIfSignedOut } = useSignInRedirect()

  const current = computed(() => decisionQueue.current(state.value))
  const stillFailing = computed(() => status.value === 'failed' && retried.value)

  /**
   * Whether the session that sent a request is still the current one. When it ended (it
   * left for sign-in, which cleared the state), its answer is dropped: nothing of an ended
   * session comes back into the state of the next.
   */
  function stillCurrent(started: string): boolean {
    return session.value === started
  }

  /** The queue from the server; in the browser after any other request to the mailbox. */
  function fetchInbox(limit: number, { start = false } = {}): Promise<Inbox.InboxResponse> {
    const query = start ? { limit, start: 1 } : { limit }
    return sync.exclusive(() => requestFetch<Inbox.InboxResponse>('/api/inbox', { query }))
  }

  function showQueue(items: readonly Inbox.QueueItem[]): void {
    state.value = decisionQueue.refresh(state.value, items)
    preparing.value = false
    retried.value = false
    status.value = 'ready'
  }

  /** Reports a failed load of the session `started`, unless that session ended or the user had to leave for sign-in. */
  async function failLoading(error: unknown, started: string): Promise<void> {
    if (stillCurrent(started) && !(await leaveIfSignedOut(error))) {
      console.error('Loading the inbox failed', error)
      status.value = 'failed'
    }
  }

  async function retry(): Promise<void> {
    retried.value ||= status.value === 'failed'
    const started = session.value
    try {
      const response = await fetchInbox(FIRST_PAGE, { start: true })
      if (!stillCurrent(started)) {
        return
      }
      if (response.preparing) {
        state.value = decisionQueue.refresh(state.value, response.items)
        preparing.value = true
        status.value = 'checking'
      } else {
        showQueue(response.items)
      }
    } catch (error) {
      await failLoading(error, started)
    }
  }

  async function load(): Promise<void> {
    if (status.value === 'idle') {
      await retry()
    }
  }

  async function refreshFromServer(): Promise<boolean> {
    const started = session.value
    try {
      // Read the state only once the list is here: the user may have acted meanwhile
      const { items } = await fetchInbox(REFILL_PAGE)
      if (!stillCurrent(started)) {
        return false
      }
      state.value = decisionQueue.refresh(state.value, items)
      refilled.value = true
      return true
    } catch (error) {
      // Keep the queue as it is; the next trigger tries again
      if (stillCurrent(started) && !(await leaveIfSignedOut(error))) {
        console.error('Refreshing the inbox failed', error)
      }
      return false
    }
  }

  async function refill(): Promise<boolean> {
    if (import.meta.server) {
      return false
    }
    const flights = inFlightOf(session.value)
    flights.refill ??= refreshFromServer().finally(() => {
      flights.refill = undefined
    })
    return flights.refill
  }

  /** The sync to its end, then a refill, so better mail found deeper joins after the current item. */
  async function syncAndRefill(): Promise<void> {
    if (await sync.untilDone()) {
      await refill()
    }
  }

  /** A refill when the queue is short or none came yet; a sync and a refill when the last sync is stale. */
  function afterPaint(): void {
    if (!refilled.value || state.value.pending.length <= REFILL_THRESHOLD) {
      void refill()
    }
    if (sync.isStale()) {
      void syncAndRefill()
    }
  }

  /** The first page once the starting batch ran; with still nothing to show, after a sync to its end. */
  async function firstPageAfterBatch(): Promise<Inbox.InboxResponse | undefined> {
    const first = await fetchInbox(FIRST_PAGE)
    if (first.items.length > 0 || !first.preparing) {
      return first
    }
    return (await sync.untilDone()) ? fetchInbox(FIRST_PAGE) : undefined
  }

  /** The starting batch and the first page; while another tab's step holds the mailbox, the queue may fill without the batch. */
  async function firstPage(): Promise<Inbox.InboxResponse | undefined> {
    const meanwhile: { response?: Inbox.InboxResponse } = {}
    const batched = await sync.startBatch(async () => {
      const response = await fetchInbox(FIRST_PAGE)
      meanwhile.response = response.items.length > 0 ? response : undefined
      return meanwhile.response !== undefined
    })
    if (!batched) {
      return undefined
    }
    return meanwhile.response ?? firstPageAfterBatch()
  }

  /**
   * Nothing was worth showing: reads the newest mail first (the starting batch), then
   * shows the best of it, while "Checking for new mail." is on screen. The sync carries
   * on behind the page.
   */
  async function prepare(): Promise<void> {
    const started = session.value
    status.value = 'checking'
    const response = await firstPage()
    // Not when it left for sign-in, which reset the state
    if (!stillCurrent(started) || status.value !== 'checking') {
      return
    }
    if (!response || (response.items.length === 0 && response.preparing)) {
      status.value = 'failed'
      return
    }
    showQueue(response.items)
    afterPaint()
  }

  function resume(): void {
    if (import.meta.server) {
      return
    }
    if (preparing.value) {
      const started = session.value
      const flights = inFlightOf(started)
      flights.preparing ??= prepare()
        .catch((error: unknown) => failLoading(error, started))
        .finally(() => {
          flights.preparing = undefined
        })
    } else if (current.value) {
      afterPaint()
    }
  }

  /**
   * Resolves once there is mail to show again, refilled after a step of the sync (which
   * carries on behind the page), or once the sync ended: to whether the queue may be shown,
   * as mail or as Inbox zero. Not after a sync that failed, unless mail came meanwhile.
   */
  function mailOrSyncEnd(): Promise<boolean> {
    const { promise, resolve: settle } = Promise.withResolvers<boolean>()
    const seen = { mail: false }
    async function afterStep(): Promise<void> {
      if (!seen.mail && (await refill()) && state.value.pending.length > 0) {
        seen.mail = true
        settle(true)
      }
    }
    void sync.untilDone({ afterStep }).then(async synced => {
      const refreshed = synced && (await refill())
      settle(refreshed || state.value.pending.length > 0)
    })
    return promise
  }

  /** A check for new mail instead of a flash of Inbox zero; "Checking for new mail." only once it takes a while. */
  async function checkBeforeInboxZero(): Promise<void> {
    const started = session.value
    status.value = 'waiting'
    const timer = setTimeout(() => {
      if (stillCurrent(started) && status.value === 'waiting') {
        status.value = 'checking'
      }
    }, timing.quietCheckMs)
    const shown = await mailOrSyncEnd()
    clearTimeout(timer)
    // Not when the check left for sign-in, which reset the state
    if (stillCurrent(started) && (status.value === 'waiting' || status.value === 'checking')) {
      status.value = shown ? 'ready' : 'failed'
    }
  }

  function afterResolve(): void {
    const left = state.value.pending.length
    if (left === 0) {
      void checkBeforeInboxZero()
      return
    }
    if (left <= REFILL_THRESHOLD) {
      void refill()
    }
    // Mail that arrived meanwhile: a sync and a refill, once the last sync is two minutes old
    if (sync.isStale()) {
      void syncAndRefill()
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
      const before = state.value
      state.value = decisionQueue.resolve(state.value, item.key, action.kind)
      // A background request left for sign-in meanwhile, which reset the queue: nothing follows
      if (state.value === before) {
        return undefined
      }
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
      return
    }
    // The index lists again on the next step, in case a listing removed the message meanwhile
    void sync.untilDone()
  }

  function reset(items: readonly Inbox.QueueItem[]): void {
    state.value = decisionQueue.create(items)
    preparing.value = false
    retried.value = false
    refilled.value = false
    status.value = 'ready'
  }

  return {
    current,
    status: readonly(status),
    stillFailing,
    resolving: readonly(resolving),
    load,
    retry,
    resume,
    refill,
    resolve,
    undo,
    reset,
  }
}

/** The page sizes, for tests that check what was asked for. */
useInboxQueue.pageSizes = { first: FIRST_PAGE, refill: REFILL_PAGE } as const
/** How long a check before Inbox zero stays quiet; the specs set it. */
useInboxQueue.timing = timing

export default useInboxQueue
