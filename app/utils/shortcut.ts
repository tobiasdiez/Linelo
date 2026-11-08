import menuOrDialogOpen from './menu-or-dialog-open'

/**
 * Wraps a keyboard shortcut handler: a held-down key triggers it only once, and
 * nothing happens while a menu or dialog is open.
 */
function shortcut(handler: () => void): (event?: KeyboardEvent) => void {
  return event => {
    if (!event?.repeat && !menuOrDialogOpen()) {
      handler()
    }
  }
}

export default shortcut
