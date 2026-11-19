import sessionScoped from '~/utils/session-scoped'
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

/** What one session has going on with the mailbox: its last request, its sync in flight, and who waits on that sync's steps. */
interface Lane {
  tail: Promise<unknown>
  syncing?: Promise<boolean>
  afterStep: Set<() => Promise<void>>
}

// Client only: the lane of the current session; a new session starts with an empty one
const laneOf = sessionScoped<Lane>(() => ({ tail: Promise.resolve(), afterStep: new Set() }))

function exclusiveIn<Result>(lane: Lane, request: () => Promise<Result>): Promise<Result> {
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

function post(lane: Lane, start: boolean): Promise<Inbox.SyncResponse> {
  const body: Inbox.SyncRequest = { start }
  return exclusiveIn(lane, () =>
    $fetch<Inbox.SyncResponse>('/api/inbox/sync', { method: 'POST', body }),
  )
}

/**
 * One sync call in the lane; while the mailbox is busy, asks again a second later, ten times
 * at most, and not once the session `ended`. `settled` may end the wait early.
 */
async function call(
  lane: Lane,
  start: boolean,
  { ended, settled }: { ended: () => boolean; settled?: () => Promise<boolean> },
): Promise<CallOutcome> {
  for (let tries = 0; tries < MAX_BUSY && !ended(); tries += 1) {
    // Each call waits for the one before
    // eslint-disable-next-line eslint/no-await-in-loop
    const { status } = await post(lane, start)
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

/** Tells whoever waits on the sync's steps that one ended with more to do, until the session `ended`. */
async function afterStep(lane: Lane, ended: () => boolean): Promise<void> {
  for (const listener of lane.afterStep) {
    if (ended()) {
      return
    }
    // One after another, each through the lane
    // eslint-disable-next-line eslint/no-await-in-loop
    await listener()
  }
}

/** The sync behind the page, which keeps the index of unread mail in step with the mailbox. */
function useInboxSync(): InboxSyncApi {
  const session = useState(stateKeys.inboxSession, sessionScoped.newSession)
  /** When a sync last ran to its end, in this session. */
  const syncedAt = useState<number | undefined>(stateKeys.inboxSyncedAt, () => undefined)
  const { leaveIfSignedOut } = useSignInRedirect()

  function lane(): Lane {
    return laneOf(session.value)
  }

  /** Whether the session this lane belongs to ended (it left for sign-in, which cleared it). */
  function endedFor(own: Lane): () => boolean {
    return () => lane() !== own
  }

  function exclusive<Result>(request: () => Promise<Result>): Promise<Result> {
    return import.meta.server ? request() : exclusiveIn(lane(), request)
  }

  async function startBatch(settled: () => Promise<boolean>): Promise<boolean> {
    if (import.meta.server) {
      return false
    }
    const own = lane()
    const ended = endedFor(own)
    try {
      return (await call(own, true, { ended, settled })) !== 'busy' && !ended()
    } catch (error) {
      // An ended session reports nothing: the user left it already
      if (!ended() && !(await leaveIfSignedOut(error))) {
        console.error('Reading the newest mail failed', error)
      }
      return false
    }
  }

  /**
   * Steps until `done`; a mailbox that stays busy ends the run quietly, three failures in a
   * row end it too, and so does the end of its session.
   */
  async function run(own: Lane): Promise<boolean> {
    const ended = endedFor(own)
    let failures = 0
    while (failures < MAX_FAILURES && !ended()) {
      try {
        // eslint-disable-next-line eslint/no-await-in-loop
        const outcome = await call(own, false, { ended })
        if (ended()) {
          return false
        }
        if (outcome === 'done') {
          syncedAt.value = Date.now()
          return true
        }
        if (outcome !== 'more') {
          return false
        }
        failures = 0
        // eslint-disable-next-line eslint/no-await-in-loop
        await afterStep(own, ended)
      } catch (error) {
        // An ended session reports nothing: the user left it already
        // eslint-disable-next-line eslint/no-await-in-loop
        if (ended() || (await leaveIfSignedOut(error))) {
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
    const own = lane()
    if (listener) {
      own.afterStep.add(listener)
    }
    own.syncing ??= run(own).finally(() => {
      own.syncing = undefined
      own.afterStep.clear()
    })
    return own.syncing
  }

  function isStale(): boolean {
    const last = syncedAt.value
    return !lane().syncing && (last === undefined || Date.now() - last > STALE_AFTER_MS)
  }

  return { startBatch, untilDone, isStale, exclusive }
}

/** How long a sync stays fresh, and how long a retry waits (the specs shorten it). */
useInboxSync.staleAfterMs = STALE_AFTER_MS
useInboxSync.timing = timing

export default useInboxSync
