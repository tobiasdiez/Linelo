import latestUnreadMessage from './latest-unread-message'

/**
 * The key of the decision on `thread`: the thread plus its latest unread message.
 * See `Inbox.QueueItem.key`.
 */
function queueItemKey(thread: Inbox.Thread): string {
  return `${thread.id}:${latestUnreadMessage(thread).id}`
}

export default queueItemKey
