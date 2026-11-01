import { describe, expect, it, vi } from 'vite-plus/test'
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

/** A queue seeded with three items, with spies on the (succeeding) adapters. */
function freshQueue() {
  vi.restoreAllMocks()
  const mail = useMailActions()
  const tasks = useTaskManager()
  const spies = {
    sendReply: vi.spyOn(mail, 'sendReply'),
    markAsHandled: vi.spyOn(mail, 'markAsHandled'),
    createTask: vi.spyOn(tasks, 'createTask'),
  }
  const queue = useInboxQueue()
  queue.reset([queueItem({ id: 'a' }), queueItem({ id: 'b' }), queueItem({ id: 'c' })])
  return { queue, spies }
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

  it('brings back exactly the undone item', async () => {
    expect.hasAssertions()

    const { queue } = freshQueue()
    await queue.resolve({ kind: 'handled' })
    await queue.resolve({ kind: 'task', task: { title: 'Follow up' } })

    queue.undo('a')

    expect(queue.current.value?.thread.id).toBe('a')

    await queue.resolve({ kind: 'handled' })

    expect(queue.current.value?.thread.id).toBe('c')
  })
})
