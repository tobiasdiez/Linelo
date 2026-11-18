import actionRequest from '../mail/action-request'
import mail from './mail'
import requireUser from './require-user'

/**
 * A mail action route (`POST /api/mail/*`): a JSON body of a known size from
 * Linelo's own pages (403, 411, 413 or 415 otherwise), the signed-in user (401),
 * a body that is JSON and passes `validate` (400 with the failing field), then
 * `run` with the user's mailboxes. A failed mail call becomes its HTTP answer
 * (`mail.toHttpError`, 404 for an account that is not the user's); success is 204.
 */
function defineMailAction<Request>(
  validate: (body: unknown) => Inbox.Validated<Request>,
  run: (mailboxes: readonly Mail.Mailbox[], request: Request) => Promise<void>,
) {
  return defineEventHandler(async event => {
    const refused = actionRequest.refusal(event.headers)
    if (refused) {
      throw createError(refused)
    }
    const user = await requireUser(event.headers)
    const parsed = actionRequest.parseBody(await readRawBody(event))
    const validated: Inbox.Validated<Request> = parsed
      ? validate(parsed.body)
      : { field: 'request' }
    const { value: request, field } = validated
    if (!request) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: { field } })
    }
    try {
      await run(await mail.mailboxesOf(user.id), request)
    } catch (error) {
      throw mail.toHttpError(error)
    }
    return sendNoContent(event)
  })
}

export default defineMailAction
