import latestMessage from './latest-message'

/** The newest unread message of the thread, or its newest message when nothing is unread. */
function latestUnreadMessage(thread: Inbox.Thread): Inbox.Message {
  return thread.messages.findLast(message => message.unread) ?? latestMessage(thread)
}

export default latestUnreadMessage
