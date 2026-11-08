import { describe, expect, it } from 'vite-plus/test'
import decisionQueue from '#shared/utils/decision-queue'
import inboxBuilders from '~/data/inbox-builders'

const { message, queueItem } = inboxBuilders
const first = queueItem({ id: 'a' })
const second = queueItem({ id: 'b' })
const third = queueItem({ id: 'c' })

function pendingIds(state: Inbox.QueueState): string[] {
  return state.pending.map(item => item.thread.id)
}

describe('decision queue', () => {
  it('starts with the first item', () => {
    expect(decisionQueue.current(decisionQueue.create([first, second]))).toBe(first)
  })

  it('advances to the next item on resolve', () => {
    const state = decisionQueue.resolve(
      decisionQueue.create([first, second, third]),
      first.key,
      'handled',
    )

    expect(decisionQueue.current(state)).toBe(second)
  })

  it('returns undefined at inbox zero', () => {
    const state = decisionQueue.resolve(decisionQueue.create([first]), first.key, 'handled')

    expect(decisionQueue.current(state)).toBeUndefined()
  })

  it('does not re-surface resolved items', () => {
    const resolved = decisionQueue.resolve(
      decisionQueue.create([first, second]),
      first.key,
      'handled',
    )

    expect(decisionQueue.resolve(resolved, first.key, 'handled')).toBe(resolved)
    expect(pendingIds(resolved)).toStrictEqual(['b'])
  })

  it('leaves the given state untouched', () => {
    const state = decisionQueue.create([first, second])

    decisionQueue.resolve(state, first.key, 'handled')

    expect(pendingIds(state)).toStrictEqual(['a', 'b'])
  })

  it('remembers how an item was resolved', () => {
    const state = decisionQueue.resolve(decisionQueue.create([first]), first.key, 'task')

    expect(decisionQueue.resolution(state, first.key)).toStrictEqual({ item: first, kind: 'task' })
  })

  it('puts exactly the undone item back at the front', () => {
    let state = decisionQueue.create([first, second, third])
    state = decisionQueue.resolve(state, first.key, 'handled')
    state = decisionQueue.resolve(state, second.key, 'handled')

    state = decisionQueue.undo(state, first.key)

    expect(pendingIds(state)).toStrictEqual(['a', 'c'])
    expect(state.resolved.map(entry => entry.item.thread.id)).toStrictEqual(['b'])
  })

  it('ignores undo for an item that was not resolved', () => {
    const state = decisionQueue.create([first])

    expect(decisionQueue.undo(state, first.key)).toBe(state)
  })
})

describe('decision queue refresh', () => {
  it('keeps the current item as it is and takes the rest from the server', () => {
    const state = decisionQueue.create([first, second])
    const changedFirst = queueItem({ id: 'a', subject: 'Changed meanwhile' })

    const refreshed = decisionQueue.refresh(state, [changedFirst, third])

    expect(refreshed.pending).toStrictEqual([first, third])
  })

  it('leaves out items resolved in this session, which the mailbox may not reflect yet', () => {
    const state = decisionQueue.resolve(decisionQueue.create([first, second]), first.key, 'handled')

    expect(pendingIds(decisionQueue.refresh(state, [first, second, third]))).toStrictEqual([
      'b',
      'c',
    ])
  })

  it('drops items that were read elsewhere', () => {
    const state = decisionQueue.create([first, second, third])

    expect(pendingIds(decisionQueue.refresh(state, [first, third]))).toStrictEqual(['a', 'c'])
  })

  it('brings a resolved thread back when new mail arrives in it', () => {
    const state = decisionQueue.resolve(decisionQueue.create([first, second]), first.key, 'handled')
    const newMail = queueItem({
      id: 'a',
      messages: [message({ id: 'a-message', unread: false }), message({ id: 'a-reply' })],
    })

    const refreshed = decisionQueue.refresh(state, [newMail, second])

    expect(refreshed.pending.map(item => item.key)).toStrictEqual([second.key, newMail.key])
  })

  it('takes the server list as it is at inbox zero', () => {
    const state = decisionQueue.resolve(decisionQueue.create([first]), first.key, 'handled')

    expect(pendingIds(decisionQueue.refresh(state, [second]))).toStrictEqual(['b'])
  })
})
