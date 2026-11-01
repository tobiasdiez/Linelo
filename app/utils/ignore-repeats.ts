/** Wraps a shortcut handler so a held-down key triggers it only once. */
function ignoreRepeats(handler: () => void): (event?: KeyboardEvent) => void {
  return event => {
    if (!event?.repeat) {
      handler()
    }
  }
}

export default ignoreRepeats
