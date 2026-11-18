import { accounts, users } from '../db/schema'
import { asc, eq } from 'drizzle-orm'
import type createDatabase from '../db/client'

interface Dependencies<Provider> {
  db: ReturnType<typeof createDatabase>['db']
  /** Adapters by provider id. */
  providers: Readonly<Record<string, Provider>>
  tokens: Mail.TokenSource
}

interface AccountRow {
  id: string
  providerId: string
  scope: string | null
  mailboxAddress: string | null
  mailboxName: string | null
  userEmail: string
  userName: string
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

/** The user's provider accounts, oldest first. */
function accountRows(
  db: ReturnType<typeof createDatabase>['db'],
  userId: string,
): Promise<AccountRow[]> {
  return db
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
}

/** The account as adapters see it: its address, and its tokens. */
function connectionOf(row: AccountRow, userId: string, tokens: Mail.TokenSource): Mail.Connection {
  const address = {
    name: row.mailboxName ?? row.userName,
    email: row.mailboxAddress ?? row.userEmail,
  }
  const account = { id: row.id, userId }
  return {
    account: { id: row.id, address },
    accessToken: ({ force = false } = {}) => tokens.accessToken(account, { force }),
  }
}

/**
 * The user's mail accounts: accounts whose provider has a mail adapter and whose
 * granted scopes include mail access (an account used only to sign in is not a mailbox).
 */
async function loadMailboxes(
  { db, providers, tokens }: Dependencies<Mail.Provider>,
  userId: string,
): Promise<Mail.Mailbox[]> {
  const rows = await accountRows(db, userId)
  return rows.flatMap(row => {
    const provider = providers[row.providerId]
    if (!provider || !hasScopes(grantedScopes(row.scope), provider.mailScopes)) {
      return []
    }
    return [{ providerId: row.providerId, provider, connection: connectionOf(row, userId, tokens) }]
  })
}

/**
 * The user's calendar accounts: accounts whose provider has a calendar adapter. The stored
 * scopes are not checked: they go stale when an existing account consents to calendar
 * access later (Better Auth only rewrites them when linking), so Graph decides, with a 403.
 */
async function loadCalendarAccounts(
  { db, providers, tokens }: Dependencies<Calendar.Provider>,
  userId: string,
): Promise<Calendar.Account[]> {
  const rows = await accountRows(db, userId)
  return rows.flatMap(row => {
    const provider = providers[row.providerId]
    return provider
      ? [{ providerId: row.providerId, provider, connection: connectionOf(row, userId, tokens) }]
      : []
  })
}

const connections = { loadMailboxes, loadCalendarAccounts }

export default connections
