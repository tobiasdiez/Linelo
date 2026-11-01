/** The message being decided: the newest one in the thread. */
function latestMessage(thread: Inbox.Thread): Inbox.Message {
  return thread.messages.at(-1) ?? thread.messages[0]
}

export default latestMessage
