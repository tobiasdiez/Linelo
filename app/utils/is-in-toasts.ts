/**
 * Whether the event target is inside the toasts' own list (inside their region;
 * menus have a viewport of the same name). Escape there is meant for the toast.
 */
function isInToasts(target: EventTarget | null | undefined): boolean {
  return (
    target instanceof Element && target.closest('[role="region"] [data-slot="viewport"]') !== null
  )
}

export default isInToasts
