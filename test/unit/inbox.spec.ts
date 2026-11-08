import { describe, expect, it } from 'vite-plus/test'
import inbox from '#server/mail/inbox'
import inboxBuilders from '~/data/inbox-builders'
import mailFakes from './mail-fakes'

const { mailboxOwner: me, message, participant } = inboxBuilders
const lena = participant('Lena Hartmann')
const work = { name: 'Mara Lindqvist', email: 'mara@work.example' }
const MOST = 20
const FIRST_PAGE = 4

/** A thread as a provider lists it, with its own id. */
function thread(id: string, messages: [Inbox.Message, ...Inbox.Message[]]): Mail.Thread {
  return { id, subject: id, messages }
}

const { mailbox } = mailFakes

describe('merged inbox', () => {
  it('merges the mailboxes by their newest unread message', async () => {
    expect.hasAssertions()
    const personal = mailbox('personal', me, [
      thread('p1', [message({ id: 'p1-1', sentAt: '2026-10-12T09:00:00Z' })]),
      thread('p2', [message({ id: 'p2-1', sentAt: '2026-10-10T09:00:00Z' })]),
    ])
    const office = mailbox('office', work, [
      thread('o1', [message({ id: 'o1-1', sentAt: '2026-10-11T09:00:00Z', to: [work] })]),
    ])

    const { items } = await inbox.load([personal, office], { limit: 2 })

    expect(items.map(item => item.thread.id)).toStrictEqual(['personal:p1', 'office:o1'])
    expect(personal.provider.listUnreadThreads).toHaveBeenCalledExactlyOnceWith(
      personal.connection,
      { limit: 2 },
    )
  })

  it('keys an item by its thread and latest unread message', async () => {
    expect.hasAssertions()
    const read = message({ id: 'first', unread: false })
    const unread = message({ id: 'second' })
    const ownReply = message({ id: 'third', from: me, unread: false })

    const { items } = await inbox.load(
      [mailbox('personal', me, [thread('t', [read, unread, ownReply])])],
      { limit: FIRST_PAGE },
    )

    expect(items[0]?.key).toBe('personal:t:second')
    expect(items[0]?.suggestions).toStrictEqual([])
  })

  it('tells threads of different accounts apart, even with the same provider id', async () => {
    expect.hasAssertions()
    const personal = mailbox('personal', me, [thread('same', [message({ id: 'p' })])])
    const office = mailbox('office', work, [thread('same', [message({ id: 'o' })])])

    const { items } = await inbox.load([personal, office], { limit: FIRST_PAGE })

    expect(items.map(item => [item.thread.id, item.thread.accountId])).toStrictEqual([
      ['personal:same', 'personal'],
      ['office:same', 'office'],
    ])
  })

  it('lists the mail accounts as the app sees them', () => {
    const personal = mailbox('personal', me)

    expect(inbox.accountsOf([personal])).toStrictEqual([
      { id: 'personal', provider: 'microsoft', address: me },
    ])
  })

  it('explains why a thread is shown from where the user is addressed', async () => {
    expect.hasAssertions()
    const threads = [
      thread('to', [message({ id: 'to', to: [me] })]),
      thread('cc', [message({ id: 'cc', to: [lena], cc: [me] })]),
      thread('list', [message({ id: 'list', to: [participant('Team')] })]),
    ]

    const { items } = await inbox.load([mailbox('personal', me, threads)], { limit: FIRST_PAGE })

    expect(items.map(item => item.whyShown)).toStrictEqual([
      'Unread and sent to you directly. Newest mail comes first.',
      'Unread, with you in Cc. Newest mail comes first.',
      'Unread in your inbox. Newest mail comes first.',
    ])
  })

  it('asks to sign in again when no mailbox is connected', async () => {
    expect.hasAssertions()

    await expect(inbox.load([], { limit: FIRST_PAGE })).rejects.toMatchObject({
      kind: 'reconnect',
    })
  })

  it('reads the limit as a whole number between 1 and 20', () => {
    expect(
      [undefined, '4', '0', '50', 'many', '2.5'].map(value => inbox.parseLimit(value)),
    ).toStrictEqual([MOST, FIRST_PAGE, 1, MOST, MOST, MOST])
  })
})
