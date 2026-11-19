import stateKeys from '~/data/state-keys'

/** After an action, a sync starts once the last one that ran to its end is older than this. */
const STALE_AFTER_MS = 120_000
/** Failures in a row that stop a sync until the next trigger. */
const MAX_FAILURES = 3
/** Busy answers in a row (another tab's steps) after which a sync call gives up. */
const MAX_BUSY = 10
/** How long a busy mailbox, or a failed call, waits before it is asked again; the specs shorten it. */
const timing = { retryAfterMs: 1000 }

/** A sync call's outcome: the step's answer, still `busy` after ten tries, or `settled` when the wait was no longer needed. */
type CallOutcome = Ranking.StepResult | 'settled'

interface InboxSyncApi {
  /**
   * Asks for the starting batch: the newest unread mail read and judged. While another step
   * holds the mailbox, `settled` is asked each second whether the queue already has
   * something; the batch is repeated only while it has not. Resolves to whether it worked.
   */
  startBatch: (settled: () => Promise<boolean>) => Promise<boolean>
  /**
   * Calls the sync until it answers `done`, one call at a time and never while a refill
   * runs; `afterStep` runs after each step that left more to do. Resolves to whether it ran
   * to its end; one sync runs at a time, and a second caller joins it.
   */
  untilDone: (options?: { afterStep?: () => Promise<void> }) => Promise<boolean>
  /** No sync is running, and none ran to its end within the last two minutes. */
  isStale: () => boolean
  /**
   * Runs a request to the mailbox once the one before it is done: the page sends one at a
   * time, as Outlook allows only about four concurrent requests per mailbox.
   */
  exclusive: <Result>(request: () => Promise<Result>) => Promise<Result>
}

// Client only: the last request to the mailbox, the sync in flight, and who waits on its steps
const lane: {
  tail: Promise<unknown>
  syncing?: Promise<boolean>
  afterStep: Set<() => Promise<void>>
} = { tail: Promise.resolve(), afterStep: new Set() }

function exclusive<Result>(request: () => Promise<Result>): Promise<Result> {
  if (import.meta.server) {
    return request()
  }
  const turn = lane.tail.then(request)
  // The next request waits for this one, whether it succeeds or fails
  lane.tail = turn.catch(() => undefined)
  return turn
}

function wait(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, timing.retryAfterMs)
  })
}

function post(start: boolean): Promise<Inbox.SyncResponse> {
  const body: Inbox.SyncRequest = { start }
  return exclusive(() => $fetch<Inbox.SyncResponse>('/api/inbox/sync', { method: 'POST', body }))
}

/** One sync call; while the mailbox is busy, asks again a second later, ten times at most. */
async function call(start: boolean, settled?: () => Promise<boolean>): Promise<CallOutcome> {
  for (let tries = 0; tries < MAX_BUSY; tries += 1) {
    // Each call waits for the one before
    // eslint-disable-next-line eslint/no-await-in-loop
    const { status } = await post(start)
    if (status !== 'busy') {
      return status
    }
    // eslint-disable-next-line eslint/no-await-in-loop
    await wait()
    // eslint-disable-next-line eslint/no-await-in-loop
    if (settled && (await settled())) {
      return 'settled'
    }
  }
  return 'busy'
}

/** Tells whoever waits on the sync's steps that one ended with more to do. */
async function afterStep(): Promise<void> {
  for (const listener of lane.afterStep) {
    // One after another, each through the lane
    // eslint-disable-next-line eslint/no-await-in-loop
    await listener()
  }
}

/** The sync behind the page, which keeps the index of unread mail in step with the mailbox. */
function useInboxSync(): InboxSyncApi {
  /** When a sync last ran to its end, in this session. */
  const syncedAt = useState<number | undefined>(stateKeys.inboxSyncedAt, () => undefined)
  const { leaveIfSignedOut } = useSignInRedirect()

  async function startBatch(settled: () => Promise<boolean>): Promise<boolean> {
    if (import.meta.server) {
      return false
    }
    try {
      return (await call(true, settled)) !== 'busy'
    } catch (error) {
      if (!(await leaveIfSignedOut(error))) {
        console.error('Reading the newest mail failed', error)
      }
      return false
    }
  }

  /** Steps until `done`; a mailbox that stays busy ends the run quietly, three failures in a row end it too. */
  async function run(): Promise<boolean> {
    let failures = 0
    while (failures < MAX_FAILURES) {
      try {
        // eslint-disable-next-line eslint/no-await-in-loop
        const outcome = await call(false)
        if (outcome === 'done') {
          syncedAt.value = Date.now()
          return true
        }
        if (outcome === 'busy') {
          return false
        }
        failures = 0
        // eslint-disable-next-line eslint/no-await-in-loop
        await afterStep()
      } catch (error) {
        // eslint-disable-next-line eslint/no-await-in-loop
        if (await leaveIfSignedOut(error)) {
          return false
        }
        failures += 1
        if (failures === MAX_FAILURES) {
          console.error('Syncing the inbox failed', error)
        } else {
          // eslint-disable-next-line eslint/no-await-in-loop
          await wait()
        }
      }
    }
    return false
  }

  function untilDone({ afterStep: listener }: { afterStep?: () => Promise<void> } = {}) {
    if (import.meta.server) {
      return Promise.resolve(false)
    }
    if (listener) {
      lane.afterStep.add(listener)
    }
    lane.syncing ??= run().finally(() => {
      lane.syncing = undefined
      lane.afterStep.clear()
    })
    return lane.syncing
  }

  function isStale(): boolean {
    const last = syncedAt.value
    return !lane.syncing && (last === undefined || Date.now() - last > STALE_AFTER_MS)
  }

  return { startBatch, untilDone, isStale, exclusive }
}

/** How long a sync stays fresh, and how long a retry waits (the specs shorten it). */
useInboxSync.staleAfterMs = STALE_AFTER_MS
useInboxSync.timing = timing

export default useInboxSync
