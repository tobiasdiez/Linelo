import { accounts, users } from '../db/schema'
import { asc, eq } from 'drizzle-orm'
import type createDatabase from '../db/client'

interface Dependencies {
  db: ReturnType<typeof createDatabase>['db']
  /** Mail adapters by provider id. */
  providers: Readonly<Record<string, Mail.Provider>>
  tokens: Mail.TokenSource
}

/** Granted scopes as Better Auth stores them: comma separated (spaces tolerated). */
function grantedScopes(scope: string | null): string[] {
  return scope ? scope.split(/[\s,]+/).filter(entry => entry.length > 0) : []
}

/** Whether every required scope was granted, ignoring case and a resource prefix such as `https://graph.microsoft.com/`. */
function hasScopes(granted: readonly string[], required: readonly string[]): boolean {
  const normalized = granted.map(scope => scope.toLowerCase())
  return required.every(scope => {
    const wanted = scope.toLowerCase()
    return normalized.some(entry => entry === wanted || entry.endsWith(`/${wanted}`))
  })
}

/**
 * The user's mail accounts: accounts whose provider has a mail adapter and whose
 * granted scopes include mail access (an account used only to sign in is not a mailbox).
 */
async function loadMailboxes(
  { db, providers, tokens }: Dependencies,
  userId: string,
): Promise<Mail.Mailbox[]> {
  const rows = await db
    .select({
      id: accounts.id,
      providerId: accounts.providerId,
      scope: accounts.scope,
      mailboxAddress: accounts.mailboxAddress,
      mailboxName: accounts.mailboxName,
      userEmail: users.email,
      userName: users.displayName,
    })
    .from(accounts)
    .innerJoin(users, eq(users.id, accounts.userId))
    .where(eq(accounts.userId, userId))
    .orderBy(asc(accounts.createdAt))
  return rows.flatMap(row => {
    const provider = providers[row.providerId]
    if (!provider || !hasScopes(grantedScopes(row.scope), provider.mailScopes)) {
      return []
    }
    const address = {
      name: row.mailboxName ?? row.userName,
      email: row.mailboxAddress ?? row.userEmail,
    }
    const account = { id: row.id, userId }
    const connection: Mail.Connection = {
      account: { id: row.id, address },
      accessToken: ({ force = false } = {}) => tokens.accessToken(account, { force }),
    }
    return [{ providerId: row.providerId, provider, connection }]
  })
}

export default loadMailboxes
