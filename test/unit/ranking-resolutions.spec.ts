import { describe, expect, it, vi } from 'vite-plus/test'
import indexStore from '#server/ranking/index-store'
import outgoing from '#server/mail/outgoing'
import rankingFakes from './ranking-fakes'
import readState from '#server/mail/read-state'
import resolutions from '#server/ranking/resolutions'

const { envelope, now: NOW } = rankingFakes
const lena: Inbox.Participant = { name: 'Lena Hartmann', email: 'lena.hartmann@northwind.co' }

/** A mailbox synced to the end, with two unread messages. */
async function setup() {
  const { db, accountId, mailbox } = await rankingFakes.synced({
    unread: [envelope('a'), envelope('b')],
  })
  async function resolvedAt(messageId: string) {
    const rows = await indexStore.rowsOf(db, accountId, [messageId])
    return rows.get(messageId)?.resolvedAt
  }
  return { db, accountId, mailbox, dependencies: { db, now: () => NOW }, resolvedAt }
}

describe('ranking: recording what the user resolved', () => {
  it('records Mark as handled once the mailbox marked it read, and Undo', async () => {
    expect.hasAssertions()
    const { accountId, mailbox, dependencies, resolvedAt } = await setup()
    const read = resolutions.recording(dependencies, readState.apply, request => ({
      accountId: request.accountId,
      messageIds: request.messageIds,
      resolved: request.read,
    }))

    await read([mailbox], { accountId, messageIds: ['a'], read: true })
    const handled = await resolvedAt('a')
    await read([mailbox], { accountId, messageIds: ['a'], read: false })

    expect([handled, await resolvedAt('a')]).toStrictEqual([NOW, rankingFakes.none])
  })

  it('records a reply also when marking as read failed after the send, and nothing when the send failed', async () => {
    expect.hasAssertions()
    vi.spyOn(console, 'error').mockReturnValue()
    const { accountId, mailbox, dependencies, resolvedAt } = await setup()
    const reply = resolutions.recording(dependencies, outgoing.reply, request => ({
      accountId: request.accountId,
      messageIds: request.markAsRead,
      resolved: true,
    }))
    const request = { accountId, messageId: 'a', body: 'Thanks.', to: [lena], cc: [] }
    mailbox.provider.setRead.mockRejectedValueOnce(new Error('Graph is down'))

    await reply([mailbox], { ...request, markAsRead: ['a'] })
    mailbox.provider.reply.mockRejectedValueOnce(new Error('Not sent'))
    await expect(reply([mailbox], { ...request, markAsRead: ['b'] })).rejects.toThrow('Not sent')

    expect([await resolvedAt('a'), await resolvedAt('b')]).toStrictEqual([NOW, rankingFakes.none])
  })

  it('lets the next sync step list at once after Undo, so a row a listing removed comes back', async () => {
    expect.hasAssertions()
    const { db, accountId, dependencies } = await setup()

    await resolutions.record(dependencies, { accountId, messageIds: ['a'], resolved: false })

    await expect(indexStore.profile(db, accountId)).resolves.toMatchObject({
      listedAt: rankingFakes.none,
    })
  })

  it('logs a failure of the database and lets the action stand', async () => {
    expect.hasAssertions()
    const error = vi.spyOn(console, 'error').mockReturnValue()
    const { accountId, db } = await setup()
    const failure = new Error('The database is gone')
    vi.spyOn(indexStore, 'setResolved').mockRejectedValueOnce(failure)

    await expect(
      resolutions.record({ db, now: () => NOW }, { accountId, messageIds: ['a'], resolved: true }),
    ).resolves.toBeUndefined()

    expect(error).toHaveBeenCalledExactlyOnceWith(
      'Recording a resolution in the index failed',
      failure,
    )
  })
})
