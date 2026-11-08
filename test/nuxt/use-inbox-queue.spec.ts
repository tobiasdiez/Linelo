import { describe, expect, it, onTestFinished, vi } from 'vite-plus/test'
import fakeInbox from './fake-inbox-api'
import inboxBuilders from '~/data/inbox-builders'

const { participant, queueItem } = inboxBuilders
const lena = participant('Lena Hartmann')
const reply: Inbox.TerminalAction = {
  kind: 'reply',
  body: 'Thursday works.',
  to: [lena],
  cc: [],
  followUpTask: { title: 'Send the sheet to Lena', due: 'Wednesday' },
}
const items = [queueItem({ id: 'a' }), queueItem({ id: 'b' }), queueItem({ id: 'c' })]
const REFILL_PAGE = useInboxQueue.pageSizes.refill

/** A queue seeded with three items, the same on the server, with spies on the (succeeding) adapters. */
function freshQueue() {
  vi.restoreAllMocks()
  const api = fakeInbox.api(items)
  onTestFinished(() => api.restore())
  const mail = useMailActions()
  const tasks = useTaskManager()
  const spies = {
    sendReply: vi.spyOn(mail, 'sendReply'),
    markAsHandled: vi.spyOn(mail, 'markAsHandled'),
    markAsUnhandled: vi.spyOn(mail, 'markAsUnhandled'),
    createTask: vi.spyOn(tasks, 'createTask'),
  }
  const queue = useInboxQueue()
  queue.reset(items)
  return { queue, spies, api }
}

describe('inbox queue', () => {
  it('keeps the item when the mail action fails', async () => {
    expect.hasAssertions()

    const { queue, spies } = freshQueue()
    spies.markAsHandled.mockRejectedValueOnce(new Error('offline'))

    await expect(queue.resolve({ kind: 'handled' })).rejects.toThrow('offline')

    expect({
      current: queue.current.value?.thread.id,
      resolving: queue.resolving.value,
    }).toStrictEqual({ current: 'a', resolving: false })
  })

  it('ignores a second action while one is in flight', async () => {
    expect.hasAssertions()

    const { queue, spies } = freshQueue()
    const gate = Promise.withResolvers<undefined>()
    spies.markAsHandled.mockReturnValueOnce(gate.promise)

    const running = queue.resolve({ kind: 'handled' })

    await expect(queue.resolve({ kind: 'handled' })).resolves.toBeUndefined()

    gate.resolve(undefined)

    await expect(running).resolves.toMatchObject({ item: { thread: { id: 'a' } } })
    expect(spies.markAsHandled).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: 'a' }),
    )
    expect(queue.current.value?.thread.id).toBe('b')
  })

  it('sends the reply before creating its follow-up task', async () => {
    expect.hasAssertions()

    const { queue, spies } = freshQueue()

    await expect(queue.resolve(reply)).resolves.toMatchObject({ followUpFailed: false })
    expect(spies.sendReply).toHaveBeenCalledBefore(spies.createTask)
  })

  it('resolves the reply even when its follow-up task fails', async () => {
    expect.hasAssertions()

    const { queue, spies } = freshQueue()
    spies.createTask.mockRejectedValueOnce(new Error('Todoist is down'))

    await expect(queue.resolve(reply)).resolves.toMatchObject({ followUpFailed: true })
    expect(spies.sendReply).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'a' }), {
      body: 'Thursday works.',
      to: [lena],
      cc: [],
    })
    expect(queue.current.value?.thread.id).toBe('b')
  })

  it('accepts the next action while a follow-up task is still being created', async () => {
    expect.hasAssertions()

    const { queue, spies } = freshQueue()
    const todoist = Promise.withResolvers<undefined>()
    spies.createTask.mockReturnValueOnce(todoist.promise)

    const replying = queue.resolve(reply)
    await vi.waitFor(() => expect(spies.createTask).toHaveBeenCalledWith(expect.anything()))

    await expect(queue.resolve({ kind: 'handled' })).resolves.toMatchObject({
      item: { thread: { id: 'b' } },
    })

    todoist.resolve(undefined)

    await expect(replying).resolves.toMatchObject({ followUpFailed: false })
  })

  it('brings back exactly the undone item, and marks it unread again', async () => {
    expect.hasAssertions()

    const { queue, spies } = freshQueue()
    const [first] = items
    await queue.resolve({ kind: 'handled' })
    await queue.resolve({ kind: 'handled' })

    await queue.undo(first?.key ?? '')

    expect(queue.current.value?.thread.id).toBe('a')
    expect(spies.markAsUnhandled).toHaveBeenCalledExactlyOnceWith(first?.thread)

    await queue.resolve({ kind: 'handled' })

    expect(queue.current.value?.thread.id).toBe('c')
  })

  it('reverts only Mark as handled in the mailbox on undo', async () => {
    expect.hasAssertions()

    const { queue, spies } = freshQueue()
    const [first] = items
    await queue.resolve({ kind: 'task', task: { title: 'Follow up' } })

    await queue.undo(first?.key ?? '')

    expect(queue.current.value?.thread.id).toBe('a')
    expect(spies.markAsUnhandled).not.toHaveBeenCalled()
  })

  it('does not bring back an item that a refill in flight still lists', async () => {
    expect.hasAssertions()

    const { queue, api } = freshQueue()
    const gate = Promise.withResolvers<Inbox.QueueItem[]>()
    api.inbox.answer = () => gate.promise
    const refilling = queue.refill()
    await vi.waitFor(() => expect(api.inboxLimits()).toStrictEqual([String(REFILL_PAGE)]))

    await queue.resolve({ kind: 'handled' })
    gate.resolve(items)
    await refilling

    expect(queue.current.value?.thread.id).toBe('b')
  })

  it('refills in the background when two items are left', async () => {
    expect.hasAssertions()

    const { queue, api } = freshQueue()
    const newMail = queueItem({ id: 'd' })
    api.inbox.answer = () => [...items, newMail]

    await queue.resolve({ kind: 'handled' })

    await vi.waitFor(() =>
      expect(
        queue.current.value && [queue.current.value.thread.id, api.inboxLimits()],
      ).toStrictEqual(['b', [String(REFILL_PAGE)]]),
    )
    await queue.resolve({ kind: 'handled' })
    await queue.resolve({ kind: 'handled' })

    expect(queue.current.value?.thread.id).toBe('d')
  })
})
