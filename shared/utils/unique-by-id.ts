/** The entries with their first entry per id, such as events read in two ranges that overlap. */
function uniqueById<Entry extends { id: string }>(entries: readonly Entry[]): Entry[] {
  return [...new Map(entries.map(entry => [entry.id, entry])).values()]
}

export default uniqueById
