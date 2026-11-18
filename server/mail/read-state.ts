import guards from '#shared/utils/guards'
import mailboxLookup from './mailbox-lookup'

/** Validates the body of `POST /api/mail/read`. */
function validate(body: unknown): Inbox.Validated<Inbox.ReadStateRequest> {
  return guards.validate<Inbox.ReadStateRequest>(body, {
    accountId: guards.nonEmptyString,
    messageIds: guards.messageIds({ min: 1 }),
    read: guards.boolean,
  })
}

/** Marks the messages read or unread in the mailbox they live in (see `mailboxLookup.findMailbox`). */
async function apply(
  mailboxes: readonly Mail.Mailbox[],
  { accountId, messageIds, read }: Inbox.ReadStateRequest,
): Promise<void> {
  const { provider, connection } = mailboxLookup.findMailbox(mailboxes, accountId)
  await provider.setRead(connection, messageIds, read)
}

const readState = { validate, apply }

export default readState
