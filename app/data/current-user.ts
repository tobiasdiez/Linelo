import fixtureAccount from '#shared/data/fixture-account'
import mailboxOwner from '#shared/data/mailbox-owner'

/** The signed-in user in stories and tests: the owner of the example mailbox. */
const currentUser: Session.User = {
  name: mailboxOwner.name,
  email: mailboxOwner.email,
  accounts: [fixtureAccount],
}

export default currentUser
