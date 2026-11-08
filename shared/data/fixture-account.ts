import mailboxOwner from './mailbox-owner'

/** The mail account the example threads live in, in stories and tests. */
const fixtureAccount: Inbox.MailAccount = {
  id: 'account-fixture',
  provider: 'microsoft',
  address: mailboxOwner,
}

export default fixtureAccount
