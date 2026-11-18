/**
 * Reka closes every toast on Escape, wherever it is pressed. An Undo toast only closes
 * on Escape pressed inside the toasts; menus see that Escape as handled and close
 * themselves (`AppHeader`). For `onEscapeKeyDown` of a toast.
 */
function keepOnOutsideEscape(event: KeyboardEvent): void {
  const { target } = event
  // The toasts' own list, inside their region (menus have a viewport of the same name)
  if (!(target instanceof Element && target.closest('[role="region"] [data-slot="viewport"]'))) {
    event.preventDefault()
  }
}

export default keepOnOutsideEscape
