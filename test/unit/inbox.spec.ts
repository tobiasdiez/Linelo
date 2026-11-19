import { describe, expect, it } from 'vite-plus/test'
import inbox from '#server/mail/inbox'
import inboxBuilders from '~/data/inbox-builders'
import mailFakes from './mail-fakes'

const MOST = 20
const FIRST_PAGE = 4

describe('the inbox', () => {
  it('lists the mail accounts as the app sees them', () => {
    const personal = mailFakes.mailbox('personal', inboxBuilders.mailboxOwner)

    expect(inbox.accountsOf([personal])).toStrictEqual([
      { id: 'personal', provider: 'microsoft', address: inboxBuilders.mailboxOwner },
    ])
  })

  it('reads the limit as a whole number between 1 and 20, and start as 1 or true', () => {
    expect({
      limits: [undefined, '4', '0', '50', 'many', '2.5'].map(value => inbox.parseLimit(value)),
      starts: [undefined, '1', 'true', '0', 'yes', ['1']].map(value => inbox.parseStart(value)),
    }).toStrictEqual({
      limits: [MOST, FIRST_PAGE, 1, MOST, MOST, MOST],
      starts: [false, true, true, false, false, false],
    })
  })

  it('validates the body of a sync request', () => {
    expect(
      [{ start: true }, { start: 'yes' }, {}, { start: false, more: 1 }, undefined].map(body =>
        inbox.validateSync(body),
      ),
    ).toStrictEqual([
      { value: { start: true } },
      { field: 'start' },
      { field: 'start' },
      { field: 'more' },
      { field: 'request' },
    ])
  })
})
