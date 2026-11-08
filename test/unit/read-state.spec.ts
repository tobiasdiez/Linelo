import { describe, expect, it } from 'vite-plus/test'
import mailFakes from './mail-fakes'
import readState from '#server/mail/read-state'

describe('read state', () => {
  it('accepts only a well-formed request', () => {
    const valid = { accountId: 'a', messageIds: ['m1', 'm2'], read: true }

    expect(
      [
        valid,
        { ...valid, read: 'yes' },
        { ...valid, messageIds: [] },
        { ...valid, messageIds: ['m1', 2] },
        { ...valid, accountId: '' },
        { ...valid, messageIds: Array.from({ length: 101 }, (_, index) => `m${index}`) },
        undefined,
      ].map(value => readState.isRequest(value)),
    ).toStrictEqual([true, false, false, false, false, false, false])
  })

  it('marks the messages in the mailbox they belong to', async () => {
    expect.hasAssertions()
    const personal = mailFakes.mailbox('personal')
    const office = mailFakes.mailbox('office')

    const applied = await readState.apply([personal, office], {
      accountId: 'office',
      messageIds: ['m1'],
      read: false,
    })

    expect({ applied }).toStrictEqual({ applied: true })
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

    const applied = await readState.apply([personal], {
      accountId: 'someone-else',
      messageIds: ['m1'],
      read: true,
    })

    expect({ applied }).toStrictEqual({ applied: false })
    expect(personal.provider.setRead).not.toHaveBeenCalled()
  })
})
