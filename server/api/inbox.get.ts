import inbox from '../mail/inbox'
import mail from '../utils/mail'
import ranking from '../utils/ranking'
import requireUser from '../utils/require-user'

/** The signed-in user's queue, from the index of unread mail; `start` on the first request of a session. */
export default defineEventHandler(async (event): Promise<Inbox.InboxResponse> => {
  const user = await requireUser(event.headers)
  const query = getQuery(event)
  const request = { limit: inbox.parseLimit(query.limit), start: inbox.parseStart(query.start) }
  try {
    return await ranking.loadQueue(await mail.mailboxesOf(user.id), request)
  } catch (error) {
    throw mail.toHttpError(error)
  }
})
