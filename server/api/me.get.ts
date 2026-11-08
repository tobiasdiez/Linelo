import auth from '../utils/auth'
import inbox from '../mail/inbox'
import mail from '../utils/mail'

/**
 * The signed-in user and their mail accounts (no mail is fetched), or
 * `user: null` when signed out, like Better Auth's session endpoint.
 */
export default defineEventHandler(async (event): Promise<Inbox.MeResponse> => {
  const session = await auth.api.getSession({ headers: event.headers })
  if (!session) {
    // JSON has no `undefined`
    // eslint-disable-next-line unicorn/no-null
    return { user: null, accounts: [] }
  }
  const { id, name, email } = session.user
  return { user: { name, email }, accounts: inbox.accountsOf(await mail.mailboxesOf(id)) }
})
