/**
 * Pure operations on the queue of items waiting for a decision. Every
 * operation returns new state, so the caller decides where state lives.
 * Items are addressed by their `key`, which changes when new mail arrives in a thread.
 */
function create(items: readonly Inbox.QueueItem[]): Inbox.QueueState {
  return { pending: [...items], resolved: [] }
}

/** The item to decide now, or `undefined` at inbox zero. */
function current(state: Inbox.QueueState): Inbox.QueueItem | undefined {
  return state.pending[0]
}

/** Moves the item out of the queue. Unknown or already resolved items leave the state as is. */
function resolve(
  state: Inbox.QueueState,
  key: string,
  kind: Inbox.TerminalAction['kind'],
): Inbox.QueueState {
  const item = state.pending.find(entry => entry.key === key)
  if (!item) {
    return state
  }
  return {
    pending: state.pending.filter(entry => entry !== item),
    resolved: [...state.resolved, { item, kind }],
  }
}

/** How the item was resolved in this session, if it was. */
function resolution(state: Inbox.QueueState, key: string): Inbox.Resolution | undefined {
  return state.resolved.find(entry => entry.item.key === key)
}

/** Puts a resolved item back at the front of the queue. */
function undo(state: Inbox.QueueState, key: string): Inbox.QueueState {
  const entry = resolution(state, key)
  if (!entry) {
    return state
  }
  return {
    pending: [entry.item, ...state.pending.filter(item => item.thread.id !== entry.item.thread.id)],
    resolved: state.resolved.filter(other => other !== entry),
  }
}

/**
 * Takes a fresh list from the server. The current item stays as it is, so
 * nothing changes under the user's eyes; everything after it is replaced by
 * the server's list, minus what was resolved in this session (the mailbox may
 * not reflect it yet) and minus the current item's thread.
 */
function refresh(state: Inbox.QueueState, items: readonly Inbox.QueueItem[]): Inbox.QueueState {
  const shown = current(state)
  const resolvedKeys = new Set(state.resolved.map(entry => entry.item.key))
  const next = items.filter(
    item => !resolvedKeys.has(item.key) && item.thread.id !== shown?.thread.id,
  )
  return { pending: shown ? [shown, ...next] : next, resolved: state.resolved }
}

const decisionQueue = { create, current, resolve, resolution, undo, refresh }

export default decisionQueue
