import { describe, expect, it } from 'vite-plus/test'
import order from '#server/ranking/order'

interface Entry {
  id: string
  tier: Ranking.Tier
  heavy: boolean
}

/** Entries from a pattern such as `H H l`: `H` heavy, `l` light; all in the high tier unless given. */
function entries(pattern: string, tier: Ranking.Tier = 'high'): Entry[] {
  return pattern
    .split(' ')
    .map((kind, index) => ({ id: `${kind}${index}`, tier, heavy: kind === 'H' }))
}

function interleaved(items: Entry[]): string[] {
  return order.interleave(items, entry => entry).map(entry => entry.id)
}

describe('ranking: order', () => {
  it('moves a lighter message up after two heavy ones', () => {
    expect(interleaved(entries('H H H l'))).toStrictEqual(['H0', 'H1', 'l3', 'H2'])
    expect(interleaved(entries('H H H H l'))).toStrictEqual(['H0', 'H1', 'l4', 'H2', 'H3'])
  })

  it('leaves heavy messages in a row when no lighter one is among the next three', () => {
    expect(interleaved(entries('H H H H H l'))).toStrictEqual(['H0', 'H1', 'H2', 'l5', 'H3', 'H4'])
    expect(interleaved(entries('H H H H'))).toStrictEqual(['H0', 'H1', 'H2', 'H3'])
  })

  it('keeps an order that needs nothing', () => {
    expect(interleaved(entries('H H l H H l'))).toStrictEqual(['H0', 'H1', 'l2', 'H3', 'H4', 'l5'])
  })

  it('never moves a message across tiers', () => {
    const items = [...entries('H H H'), ...entries('l', 'normal')]

    expect(interleaved(items)).toStrictEqual(['H0', 'H1', 'H2', 'l0'])
  })
})
