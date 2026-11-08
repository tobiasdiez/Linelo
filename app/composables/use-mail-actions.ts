interface Reply extends Inbox.ReplyRecipients {
  body: string
}

interface MailActions {
  /** Sends a reply to the latest message of the thread. */
  sendReply: (thread: Inbox.Thread, reply: Reply) => Promise<void>
  /** Marks the thread's unread messages, the ones the user saw, as read. */
  markAsHandled: (thread: Inbox.Thread) => Promise<void>
  /** Marks the same messages unread again, to undo Mark as handled. */
  markAsUnhandled: (thread: Inbox.Thread) => Promise<void>
  /** Forwards the latest message of the thread with an optional note. */
  forward: (thread: Inbox.Thread, to: Inbox.Participant, note: string) => Promise<void>
}

/*
 * TODO: Send replies and forwards through the mail API once it has `Mail.Send`.
 * The page does not offer them yet; these succeed immediately.
 */
function sendReply(_thread: Inbox.Thread, _reply: Reply): Promise<void> {
  return Promise.resolve()
}

function forward(_thread: Inbox.Thread, _to: Inbox.Participant, _note: string): Promise<void> {
  return Promise.resolve()
}

/** Later messages in the same conversation stay unread and come back as their own decision. */
async function setRead(thread: Inbox.Thread, read: boolean): Promise<void> {
  const messageIds = thread.messages.filter(message => message.unread).map(message => message.id)
  if (messageIds.length === 0) {
    return
  }
  const body: Inbox.ReadStateRequest = { accountId: thread.accountId, messageIds, read }
  await $fetch('/api/mail/read', { method: 'POST', body })
}

function markAsHandled(thread: Inbox.Thread): Promise<void> {
  return setRead(thread, true)
}

function markAsUnhandled(thread: Inbox.Thread): Promise<void> {
  return setRead(thread, false)
}

// One shared instance, like the mail client it wraps
const mailActions: MailActions = { sendReply, markAsHandled, markAsUnhandled, forward }

/** Mail side effects of the terminal actions. */
function useMailActions(): MailActions {
  return mailActions
}

export default useMailActions
