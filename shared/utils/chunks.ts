/** The items in consecutive parts of at most `size`. */
function chunks<Item>(items: readonly Item[], size: number): Item[][] {
  const result: Item[][] = []
  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size))
  }
  return result
}

export default chunks
