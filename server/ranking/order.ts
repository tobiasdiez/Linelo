/** What interleaving needs of a queue entry. */
interface Weighed {
  tier: Ranking.Tier
  /** A long text or many recipients. */
  heavy: boolean
}

/** At most this many heavy items in a row, while a lighter one is near. */
const MAX_HEAVY_IN_A_ROW = 2
/** How far ahead a lighter item is looked for: the next three. */
const LOOK_AHEAD = 3

/** Whether the items right before `index` are heavy and of this tier. */
function heavyRun<Item>(
  items: readonly Item[],
  index: number,
  { tier, weigh }: { tier: Ranking.Tier; weigh: (item: Item) => Weighed },
): boolean {
  const before = items.slice(Math.max(index - MAX_HEAVY_IN_A_ROW, 0), index)
  return (
    before.length === MAX_HEAVY_IN_A_ROW &&
    before.every(item => {
      const weighed = weigh(item)
      return weighed.heavy && weighed.tier === tier
    })
  )
}

/**
 * Within one tier, never more than two heavy items in a row while a lighter item of the
 * same tier is among the next three: the lighter one moves up. The order is otherwise kept.
 */
function interleave<Item>(items: readonly Item[], weigh: (item: Item) => Weighed): Item[] {
  const result = [...items]
  for (let index = MAX_HEAVY_IN_A_ROW; index < result.length; index += 1) {
    const current = result[index]
    if (current === undefined) {
      continue
    }
    const { tier, heavy } = weigh(current)
    if (!heavy || !heavyRun(result, index, { tier, weigh })) {
      continue
    }
    const ahead = result.slice(index, index + LOOK_AHEAD)
    const lighter = ahead.findIndex(item => {
      const weighed = weigh(item)
      return !weighed.heavy && weighed.tier === tier
    })
    if (lighter > 0) {
      const [moved] = result.splice(index + lighter, 1)
      if (moved !== undefined) {
        result.splice(index, 0, moved)
      }
    }
  }
  return result
}

const order = { interleave }

export default order
