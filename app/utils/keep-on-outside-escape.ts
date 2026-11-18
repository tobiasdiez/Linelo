import isInToasts from './is-in-toasts'

/**
 * Reka closes every toast on Escape, wherever it is pressed (for example to leave
 * the composer). A toast the user must not lose (Undo, a send that was not
 * confirmed) only closes on Escape pressed inside the toasts; menus see that Escape
 * as handled and close themselves (`AppHeader`). For `onEscapeKeyDown` of a toast.
 */
function keepOnOutsideEscape(event: KeyboardEvent): void {
  if (!isInToasts(event.target)) {
    event.preventDefault()
  }
}

export default keepOnOutsideEscape
