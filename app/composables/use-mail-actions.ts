interface Reply extends Inbox.ReplyRecipients {
  body: string
}

interface MailActions {
  /** Sends a reply to the latest message of the thread. */
  sendReply: (thread: Inbox.Thread, reply: Reply) => Promise<void>
  /** Marks the thread as read without replying. */
  markAsHandled: (thread: Inbox.Thread) => Promise<void>
  /** Forwards the latest message of the thread with an optional note. */
  forward: (thread: Inbox.Thread, to: Inbox.Participant, note: string) => Promise<void>
}

/*
 * TODO: Call Microsoft Graph once account connection exists. Until then every
 * action succeeds immediately so the decision flow can be used end to end.
 */
function sendReply(_thread: Inbox.Thread, _reply: Reply): Promise<void> {
  return Promise.resolve()
}

function markAsHandled(_thread: Inbox.Thread): Promise<void> {
  return Promise.resolve()
}

function forward(_thread: Inbox.Thread, _to: Inbox.Participant, _note: string): Promise<void> {
  return Promise.resolve()
}

// One shared instance, like the mail client it will wrap
const mailActions: MailActions = { sendReply, markAsHandled, forward }

/** Mail side effects of the terminal actions. */
function useMailActions(): MailActions {
  return mailActions
}

export default useMailActions
