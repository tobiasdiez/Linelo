import MailError from '../mail/mail-error'
import auth from './auth'
import createTokenSource from '../auth/token-source'
import db from './db'
import httpErrorOf from '../mail/http-error'
import loadMailboxes from '../mail/connections'
import mailProviders from '../mail/providers'

const tokens = createTokenSource(auth)

/** The signed-in user's mail accounts, ready to be asked for mail. */
function mailboxesOf(userId: string): Promise<Mail.Mailbox[]> {
  return loadMailboxes({ db, providers: mailProviders, tokens }, userId)
}

/** The HTTP answer to a failed mail call (see `httpErrorOf`). Returns anything else as it is. */
function toHttpError(error: unknown): Error {
  if (!(error instanceof MailError)) {
    return error instanceof Error ? error : new Error('Mail call failed', { cause: error })
  }
  console.error('Mail call failed', error)
  return createError(httpErrorOf(error))
}

const mail = { mailboxesOf, toHttpError }

export default mail
