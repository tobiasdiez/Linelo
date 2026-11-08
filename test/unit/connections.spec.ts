import * as schema from '#server/db/schema'
import { describe, expect, it, vi } from 'vite-plus/test'
import loadMailboxes from '#server/mail/connections'
import mailFakes from './mail-fakes'
import testDatabase from './test-database'

type Account = typeof schema.accounts.$inferInsert

/** A database with Mara, her accounts as given, and another user's mailbox. */
async function setup(accountsOf: (userId: string) => Account[]) {
  const database = await testDatabase()
  const [mara, other] = await database.db
    .insert(schema.users)
    .values([
      { email: 'mara@northwind.co', displayName: 'Mara Lindqvist' },
      { email: 'jonas@northwind.co', displayName: 'Jonas Weber' },
    ])
    .returning()
  if (!mara || !other) {
    throw new Error('Users were not created')
  }
  await database.db
    .insert(schema.accounts)
    .values([
      ...accountsOf(mara.id),
      { userId: other.id, providerId: 'microsoft', accountId: 'jonas', scope: 'Mail.ReadWrite' },
    ])
  const tokens: Mail.TokenSource = {
    accessToken: vi.fn<Mail.TokenSource['accessToken']>(async (_, { force }) =>
      force ? 'refreshed' : 'stored',
    ),
  }
  const dependencies = { db: database.db, providers: { microsoft: mailFakes.provider() }, tokens }
  return { dependencies, userId: mara.id, tokens }
}

describe('mail connections', () => {
  it("lists the user's accounts that were granted the provider's mail scopes", async () => {
    expect.hasAssertions()
    const { dependencies, userId } = await setup(id => [
      {
        userId: id,
        providerId: 'microsoft',
        accountId: 'mara-work',
        scope: 'openid,email,offline_access,User.Read,https://graph.microsoft.com/mail.readwrite',
        mailboxAddress: 'mara@work.example',
        mailboxName: 'Mara (work)',
      },
      {
        userId: id,
        providerId: 'microsoft',
        accountId: 'mara-sign-in-only',
        scope: 'openid,email',
      },
      { userId: id, providerId: 'todoist', accountId: 'mara-tasks', scope: 'Mail.ReadWrite' },
    ])

    const mailboxes = await loadMailboxes(dependencies, userId)

    expect(
      mailboxes.map(({ providerId, connection }) => [providerId, connection.account.address]),
    ).toStrictEqual([['microsoft', { name: 'Mara (work)', email: 'mara@work.example' }]])
  })

  it('falls back to the user for an account without mailbox details', async () => {
    expect.hasAssertions()
    const { dependencies, userId } = await setup(id => [
      { userId: id, providerId: 'microsoft', accountId: 'mara', scope: 'Mail.ReadWrite' },
    ])

    const [mailbox] = await loadMailboxes(dependencies, userId)

    expect(mailbox?.connection.account.address).toStrictEqual({
      name: 'Mara Lindqvist',
      email: 'mara@northwind.co',
    })
  })

  it('gets the tokens of the account, refreshed when asked', async () => {
    expect.hasAssertions()
    const { dependencies, userId, tokens } = await setup(id => [
      { userId: id, providerId: 'microsoft', accountId: 'mara', scope: 'Mail.ReadWrite' },
    ])
    const [mailbox] = await loadMailboxes(dependencies, userId)
    const account = { id: mailbox?.connection.account.id, userId }

    const seen = [
      await mailbox?.connection.accessToken(),
      await mailbox?.connection.accessToken({ force: true }),
    ]

    expect(seen).toStrictEqual(['stored', 'refreshed'])
    expect(vi.mocked(tokens.accessToken).mock.calls).toStrictEqual([
      [account, { force: false }],
      [account, { force: true }],
    ])
  })
})
