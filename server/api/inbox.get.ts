import inbox from '../mail/inbox'
import mail from '../utils/mail'
import requireUser from '../utils/require-user'

/** The signed-in user's unread threads, newest unread first, and their mail accounts. */
export default defineEventHandler(async (event): Promise<Inbox.InboxResponse> => {
  const user = await requireUser(event.headers)
  const limit = inbox.parseLimit(getQuery(event).limit)
  try {
    return await inbox.load(await mail.mailboxesOf(user.id), { limit })
  } catch (error) {
    throw mail.toHttpError(error)
  }
})
