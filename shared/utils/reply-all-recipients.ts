import participants from './participants'

/**
 * Reply-all recipients for a message, never including the current user.
 * The sender (or the message's Reply-To addresses, when set) and the original
 * "to" recipients go to "to", the original "cc" recipients stay in "cc". When
 * the current user sent the message, the reply goes to the original recipients.
 * Only participants mail can be sent to are kept (`participants.withAddress`).
 */
function replyAllRecipients(message: Inbox.Message, me: Inbox.Participant): Inbox.ReplyRecipients {
  const replyTo = participants.withAddress(message.replyTo)
  const senders = replyTo.length > 0 ? replyTo : [message.from]
  const to = participants.unique(participants.withAddress([...senders, ...message.to]), [me])
  const cc = participants.unique(participants.withAddress(message.cc), [me, ...to])
  return { to, cc }
}

export default replyAllRecipients
