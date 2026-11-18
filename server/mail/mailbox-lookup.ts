import MailError from './mail-error'

/**
 * The user's mailboxes, when there is at least one. A user without any (signed
 * in, but mail access not granted, or granted before Linelo needed more) has to
 * sign in again rather than see an empty inbox or a dead end.
 */
function requireMailboxes(mailboxes: readonly Mail.Mailbox[]): readonly Mail.Mailbox[] {
  if (mailboxes.length === 0) {
    throw new MailError('reconnect', 'No mail account is connected')
  }
  return mailboxes
}

/** The user's mailbox with this account id; throws `unknownAccount` when it is not one of them. */
function findMailbox(mailboxes: readonly Mail.Mailbox[], accountId: string): Mail.Mailbox {
  const mailbox = requireMailboxes(mailboxes).find(
    ({ connection }) => connection.account.id === accountId,
  )
  if (!mailbox) {
    throw new MailError('unknownAccount', "The account is not one of the user's mailboxes")
  }
  return mailbox
}

const mailboxLookup = { requireMailboxes, findMailbox }

export default mailboxLookup
