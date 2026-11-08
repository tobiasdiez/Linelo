import mail from '../../utils/mail'
import readState from '../../mail/read-state'
import requireUser from '../../utils/require-user'

/** Marks messages read or unread in one of the signed-in user's mailboxes. */
export default defineEventHandler(async event => {
  const user = await requireUser(event.headers)
  const request = await readValidatedBody(event, body => (readState.isRequest(body) ? body : false))
  let applied = false
  try {
    applied = await readState.apply(await mail.mailboxesOf(user.id), request)
  } catch (error) {
    throw mail.toHttpError(error)
  }
  if (!applied) {
    throw createError({ statusCode: 404, statusMessage: 'No such mail account' })
  }
  return sendNoContent(event)
})
