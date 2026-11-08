import isRecord from '#shared/utils/is-record'

/** More than any thread shows at once; keeps a single request bounded. */
const MAX_MESSAGES = 100

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** Guards the body of `POST /api/mail/read`. */
function isRequest(value: unknown): value is Inbox.ReadStateRequest {
  return (
    isRecord(value) &&
    isNonEmptyString(value.accountId) &&
    typeof value.read === 'boolean' &&
    Array.isArray(value.messageIds) &&
    value.messageIds.length > 0 &&
    value.messageIds.length <= MAX_MESSAGES &&
    value.messageIds.every(id => isNonEmptyString(id))
  )
}

/**
 * Marks the messages read or unread in the mailbox they live in. Resolves to
 * `false` when the account is not one of the user's mailboxes.
 */
async function apply(
  mailboxes: readonly Mail.Mailbox[],
  { accountId, messageIds, read }: Inbox.ReadStateRequest,
): Promise<boolean> {
  const mailbox = mailboxes.find(({ connection }) => connection.account.id === accountId)
  if (!mailbox) {
    return false
  }
  await mailbox.provider.setRead(mailbox.connection, messageIds, read)
  return true
}

const readState = { isRequest, apply }

export default readState
