import decisionTarget from '#shared/utils/decision-target'

interface Reply extends Inbox.ReplyRecipients {
  body: string
}

interface MailActions {
  /**
   * Sends a reply to the latest unread message of the thread, then the server marks
   * the thread's unread messages as read. Rejects when it was not sent, or not
   * surely (`isUncertain`).
   */
  sendReply: (thread: Inbox.Thread, reply: Reply) => Promise<void>
  /** Marks the thread's unread messages, the ones the user saw, as read. */
  markAsHandled: (thread: Inbox.Thread) => Promise<void>
  /** Marks the same messages unread again, to undo Mark as handled. */
  markAsUnhandled: (thread: Inbox.Thread) => Promise<void>
  /** Forwards the latest unread message of the thread with an optional note; see `sendReply`. */
  forward: (thread: Inbox.Thread, to: Inbox.Participant, note: string) => Promise<void>
}

async function sendReply(thread: Inbox.Thread, { body, to, cc }: Reply): Promise<void> {
  const request: Inbox.ReplyRequest = {
    accountId: thread.accountId,
    ...decisionTarget(thread),
    body,
    to,
    cc,
  }
  await $fetch('/api/mail/reply', { method: 'POST', body: request })
}

async function forward(thread: Inbox.Thread, to: Inbox.Participant, note: string): Promise<void> {
  const request: Inbox.ForwardRequest = {
    accountId: thread.accountId,
    ...decisionTarget(thread),
    to: [to],
    note,
  }
  await $fetch('/api/mail/forward', { method: 'POST', body: request })
}

/** Later messages in the same conversation stay unread and come back as their own decision. */
async function setRead(thread: Inbox.Thread, read: boolean): Promise<void> {
  const { markAsRead: messageIds } = decisionTarget(thread)
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
