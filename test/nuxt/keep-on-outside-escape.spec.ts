import { describe, expect, it } from 'vite-plus/test'
import keepOnOutsideEscape from '~/utils/keep-on-outside-escape'

/** An Escape key press with this target, as Reka hands it to a toast's `onEscapeKeyDown`. */
function escapeOn(target: Element): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
  Object.defineProperty(event, 'target', { value: target })
  return event
}

describe('keep on outside Escape', () => {
  it('keeps the toast open on Escape pressed elsewhere, and lets Escape inside the toasts close it', () => {
    const region = document.createElement('section')
    region.setAttribute('role', 'region')
    const viewport = document.createElement('ol')
    viewport.dataset.slot = 'viewport'
    const toastButton = document.createElement('button')
    viewport.append(toastButton)
    region.append(viewport)
    const elsewhere = document.createElement('textarea')
    document.body.append(region, elsewhere)
    try {
      const outside = escapeOn(elsewhere)
      const inside = escapeOn(toastButton)

      keepOnOutsideEscape(outside)
      keepOnOutsideEscape(inside)

      expect({ outside: outside.defaultPrevented, inside: inside.defaultPrevented }).toStrictEqual({
        outside: true,
        inside: false,
      })
    } finally {
      region.remove()
      elsewhere.remove()
    }
  })
})
