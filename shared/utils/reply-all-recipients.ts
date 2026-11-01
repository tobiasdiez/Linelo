import participants from './participants'

/**
 * Reply-all recipients for a message, never including the current user.
 * The sender and the original "to" recipients go to "to", the original "cc"
 * recipients stay in "cc". When the current user sent the message, the reply
 * goes to the original recipients.
 */
function replyAllRecipients(message: Inbox.Message, me: Inbox.Participant): Inbox.ReplyRecipients {
  const to = participants.unique([message.from, ...message.to], [me])
  const cc = participants.unique(message.cc, [me, ...to])
  return { to, cc }
}

export default replyAllRecipients
