/**
 * Pure operations on the queue of items waiting for a decision. Every
 * operation returns new state, so the caller decides where state lives.
 */
function create(items: readonly Inbox.QueueItem[]): Inbox.QueueState {
  return { pending: [...items], resolved: [] }
}

/** The item to decide now, or `undefined` at inbox zero. */
function current(state: Inbox.QueueState): Inbox.QueueItem | undefined {
  return state.pending[0]
}

/** Moves the item out of the queue. Unknown or already resolved items leave the state as is. */
function resolve(state: Inbox.QueueState, threadId: string): Inbox.QueueState {
  const item = state.pending.find(entry => entry.thread.id === threadId)
  if (!item) {
    return state
  }
  return {
    pending: state.pending.filter(entry => entry !== item),
    resolved: [...state.resolved, item],
  }
}

/** Puts a resolved item back at the front of the queue. */
function undo(state: Inbox.QueueState, threadId: string): Inbox.QueueState {
  const item = state.resolved.find(entry => entry.thread.id === threadId)
  if (!item) {
    return state
  }
  return {
    pending: [item, ...state.pending],
    resolved: state.resolved.filter(entry => entry !== item),
  }
}

const decisionQueue = { create, current, resolve, undo }

export default decisionQueue
