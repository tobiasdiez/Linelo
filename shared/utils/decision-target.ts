import latestUnreadMessage from './latest-unread-message'

/**
 * What a reply or forward of the thread acts on: its latest unread message (the
 * decision the queue item stands for; the thread may end with the user's own
 * reply), and the unread messages the user saw, marked as read once it is sent.
 */
function decisionTarget(thread: Inbox.Thread): Omit<Inbox.MessageActionRequest, 'accountId'> {
  return {
    messageId: latestUnreadMessage(thread).id,
    markAsRead: thread.messages.filter(message => message.unread).map(message => message.id),
  }
}

export default decisionTarget
