import type { AuthContext, BetterAuthPlugin, User } from 'better-auth'
import { createAuthEndpoint } from 'better-auth/api'
import type createDatabase from '../db/client'
import mailboxOwner from '#shared/data/mailbox-owner'
import resetDemoCalendar from '../calendar/demo-reset'
import { setSessionCookie } from 'better-auth/cookies'

/** The account key of the demo mailbox; the demo mail provider serves accounts of this provider id. */
const DEMO_ACCOUNT = { providerId: 'demo', accountId: 'demo-mailbox' }

/** The owner of the demo mailbox, created on first use. Its mailbox address falls back to the user's email. */
async function demoUser({ internalAdapter }: AuthContext): Promise<User> {
  const owner = await internalAdapter.findAccountOwnerByKey(DEMO_ACCOUNT)
  if (owner?.kind === 'owned') {
    return owner.user
  }
  const created = await internalAdapter.createOAuthUser(
    { name: mailboxOwner.name, email: mailboxOwner.email, emailVerified: true },
    { ...DEMO_ACCOUNT, scope: 'mail' },
  )
  return created.user
}

/**
 * Development only: `GET /api/auth/demo/sign-in` signs in as the owner of the
 * demo mailbox (the example threads and calendars), so the app runs end to end
 * without Microsoft credentials. Every demo sign-in starts the calendars afresh.
 */
function createDemoSignIn({ db }: { db: ReturnType<typeof createDatabase>['db'] }) {
  return {
    id: 'demo-sign-in',
    endpoints: {
      demoSignIn: createAuthEndpoint('/demo/sign-in', { method: 'GET' }, async ctx => {
        const user = await demoUser(ctx.context)
        await resetDemoCalendar(db, user.id)
        const session = await ctx.context.internalAdapter.createSession(user.id)
        await setSessionCookie(ctx, { session, user })
        throw ctx.redirect('/')
      }),
    },
  } satisfies BetterAuthPlugin
}

export default createDemoSignIn
