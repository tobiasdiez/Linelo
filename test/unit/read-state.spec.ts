import { describe, expect, it } from 'vite-plus/test'
import mailFakes from './mail-fakes'
import readState from '#server/mail/read-state'

const valid: Inbox.ReadStateRequest = { accountId: 'a', messageIds: ['m1', 'm2'], read: true }

describe('read state', () => {
  it('accepts a well-formed request', () => {
    expect(readState.validate(valid)).toStrictEqual({ value: valid })
  })

  it.each([
    ['read', { ...valid, read: 'yes' }],
    ['messageIds', { ...valid, messageIds: [] }],
    ['messageIds', { ...valid, messageIds: ['m1', 2] }],
    [
      'messageIds',
      { ...valid, messageIds: Array.from({ length: 101 }, (_, index) => `m${index}`) },
    ],
    ['accountId', { ...valid, accountId: '' }],
    ['unread', { ...valid, unread: false }],
    ['request', undefined],
  ])('refuses a request with a bad %s', (field, body) => {
    expect(readState.validate(body)).toStrictEqual({ field })
  })

  it('marks the messages in the mailbox they belong to', async () => {
    expect.hasAssertions()
    const personal = mailFakes.mailbox('personal')
    const office = mailFakes.mailbox('office')

    await readState.apply([personal, office], {
      accountId: 'office',
      messageIds: ['m1'],
      read: false,
    })

    expect(office.provider.setRead).toHaveBeenCalledExactlyOnceWith(
      office.connection,
      ['m1'],
      false,
    )
    expect(personal.provider.setRead).not.toHaveBeenCalled()
  })

  it("refuses an account that is not one of the user's mailboxes", async () => {
    expect.hasAssertions()
    const personal = mailFakes.mailbox('personal')

    await expect(
      readState.apply([personal], { accountId: 'someone-else', messageIds: ['m1'], read: true }),
    ).rejects.toMatchObject({ kind: 'unknownAccount' })
    expect(personal.provider.setRead).not.toHaveBeenCalled()
  })

  it('asks to sign in again when the user has no mailbox at all', async () => {
    expect.hasAssertions()

    await expect(
      readState.apply([], { accountId: 'personal', messageIds: ['m1'], read: true }),
    ).rejects.toMatchObject({ kind: 'reconnect' })
  })
})
