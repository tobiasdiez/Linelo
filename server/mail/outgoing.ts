import guards from '#shared/utils/guards'
import mailboxLookup from './mailbox-lookup'

/** Far more than anyone types into the composer; keeps a single request bounded. */
const MAX_TEXT_LENGTH = 100_000
/** Exchange Online's own limit of recipients per message. */
const MAX_RECIPIENTS = 500

/** The fields of every request that acts on a message (`Inbox.MessageActionRequest`). */
const messageAction = {
  accountId: guards.nonEmptyString,
  messageId: guards.nonEmptyString,
  markAsRead: guards.messageIds(),
}

/**
 * Validates the body of `POST /api/mail/reply`: a reply with text, someone to
 * reply to, and at most 500 recipients in all.
 */
function validateReply(body: unknown): Inbox.Validated<Inbox.ReplyRequest> {
  const validated = guards.validate<Inbox.ReplyRequest>(body, {
    ...messageAction,
    body: guards.text(MAX_TEXT_LENGTH, { required: true }),
    to: guards.listOf(guards.participant, { min: 1, max: MAX_RECIPIENTS }),
    cc: guards.listOf(guards.participant, { max: MAX_RECIPIENTS }),
  })
  const { value } = validated
  if (value && value.to.length + value.cc.length > MAX_RECIPIENTS) {
    return { field: 'cc' }
  }
  return validated
}

/** Validates the body of `POST /api/mail/forward`: exactly one recipient, for now. */
function validateForward(body: unknown): Inbox.Validated<Inbox.ForwardRequest> {
  return guards.validate<Inbox.ForwardRequest>(body, {
    ...messageAction,
    to: guards.listOf(guards.participant, { min: 1, max: 1 }),
    note: guards.text(MAX_TEXT_LENGTH),
  })
}

/**
 * Best effort: the mail is out, so a failure here is logged and not reported.
 * A visible failure would invite sending again; the thread comes back unread on
 * the next refresh instead, with the user's answer in it.
 */
async function markAsReadQuietly(
  { provider, connection }: Mail.Mailbox,
  messageIds: readonly string[],
): Promise<void> {
  if (messageIds.length === 0) {
    return
  }
  try {
    await provider.setRead(connection, messageIds, true)
  } catch (error) {
    console.error('Marking the thread as read after sending failed', error)
  }
}

/**
 * Sends the reply from the mailbox of the account, then marks the thread's unread
 * messages as read. Rejects with a `MailError` when the reply was not (or not
 * surely) sent, or the account is not one of the user's mailboxes.
 */
async function reply(
  mailboxes: readonly Mail.Mailbox[],
  { accountId, markAsRead, ...outgoingReply }: Inbox.ReplyRequest,
): Promise<void> {
  const mailbox = mailboxLookup.findMailbox(mailboxes, accountId)
  await mailbox.provider.reply(mailbox.connection, outgoingReply)
  await markAsReadQuietly(mailbox, markAsRead)
}

/** Forwards the message, then marks the thread's unread messages as read; see `reply`. */
async function forward(
  mailboxes: readonly Mail.Mailbox[],
  { accountId, markAsRead, ...outgoingForward }: Inbox.ForwardRequest,
): Promise<void> {
  const mailbox = mailboxLookup.findMailbox(mailboxes, accountId)
  await mailbox.provider.forward(mailbox.connection, outgoingForward)
  await markAsReadQuietly(mailbox, markAsRead)
}

const outgoing = { validateReply, validateForward, reply, forward }

export default outgoing
