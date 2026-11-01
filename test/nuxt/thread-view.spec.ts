import { InboxThreadView, UApp } from '#components'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vite-plus/test'
import inboxBuilders from '~/data/inbox-builders'
import { page } from 'vite-plus/test/browser'
import { render } from '@nuxt/test-utils/browser'

describe('thread view', () => {
  it('expands an earlier message in place', async () => {
    expect.hasAssertions()

    const { thread, whyShown } = inboxBuilders.storyItem('thread-vendor-review')
    const screen = await render(
      defineComponent({ render: () => h(UApp, () => h(InboxThreadView, { thread, whyShown })) }),
    )
    try {
      const row = page.getByRole('button', { name: /^Lena Hartmann/ })

      await expect.element(row).toHaveAttribute('aria-expanded', 'false')

      expect(page.getByText(/^Starting the Q3 vendor review/).query()).toBeNull()

      await row.click()

      await expect.element(row).toHaveAttribute('aria-expanded', 'true')
      await expect.element(page.getByText(/^Starting the Q3 vendor review/)).toBeVisible()
    } finally {
      await screen.unmount()
    }
  })
})
