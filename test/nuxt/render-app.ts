import { NuxtPage, UApp } from '#components'
import { defineComponent, h } from 'vue'
import { render } from '@nuxt/test-utils/browser'

/** Renders the app's pages at `route`, unmounted when the test finishes. */
function renderApp(route: string): ReturnType<typeof render> {
  // A wrapping element of our own: pages swap inside it, and the test renderer moves its mount point
  return render(defineComponent({ render: () => h('div', [h(UApp, () => h(NuxtPage))]) }), {
    route,
  })
}

export default renderApp
