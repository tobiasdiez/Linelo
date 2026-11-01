import { describe, expect, it } from 'vite-plus/test'
import decisionQueue from '#shared/utils/decision-queue'
import inboxBuilders from '~/data/inbox-builders'

const first = inboxBuilders.queueItem({ id: 'a' })
const second = inboxBuilders.queueItem({ id: 'b' })
const third = inboxBuilders.queueItem({ id: 'c' })

function pendingIds(state: Inbox.QueueState): string[] {
  return state.pending.map(item => item.thread.id)
}

describe('decision queue', () => {
  it('starts with the first item', () => {
    expect(decisionQueue.current(decisionQueue.create([first, second]))).toBe(first)
  })

  it('advances to the next item on resolve', () => {
    const state = decisionQueue.resolve(decisionQueue.create([first, second, third]), 'a')

    expect(decisionQueue.current(state)).toBe(second)
  })

  it('returns undefined at inbox zero', () => {
    const state = decisionQueue.resolve(decisionQueue.create([first]), 'a')

    expect(decisionQueue.current(state)).toBeUndefined()
  })

  it('does not re-surface resolved items', () => {
    const resolved = decisionQueue.resolve(decisionQueue.create([first, second]), 'a')

    expect(decisionQueue.resolve(resolved, 'a')).toBe(resolved)
    expect(pendingIds(resolved)).toStrictEqual(['b'])
  })

  it('leaves the given state untouched', () => {
    const state = decisionQueue.create([first, second])

    decisionQueue.resolve(state, 'a')

    expect(pendingIds(state)).toStrictEqual(['a', 'b'])
  })

  it('puts exactly the undone item back at the front', () => {
    let state = decisionQueue.create([first, second, third])
    state = decisionQueue.resolve(state, 'a')
    state = decisionQueue.resolve(state, 'b')

    state = decisionQueue.undo(state, 'a')

    expect(pendingIds(state)).toStrictEqual(['a', 'c'])
    expect(state.resolved.map(item => item.thread.id)).toStrictEqual(['b'])
  })

  it('ignores undo for an item that was not resolved', () => {
    const state = decisionQueue.create([first])

    expect(decisionQueue.undo(state, 'a')).toBe(state)
  })
})
