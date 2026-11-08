import { AppHeader, UApp } from '#components'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vite-plus/test'
import inboxBuilders from '~/data/inbox-builders'
import { page } from 'vite-plus/test/browser'
import { render } from '@nuxt/test-utils/browser'

describe('app header', () => {
  it('shows who is signed in, and Sign out, in the account menu', async () => {
    expect.hasAssertions()
    useCurrentUser().set(inboxBuilders.signedInUser)
    const screen = await render(defineComponent({ render: () => h(UApp, () => h(AppHeader)) }))
    try {
      await page.getByRole('button', { name: 'Account: Mara Lindqvist' }).click()

      await expect.element(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible()
      await expect.element(page.getByText('mara.lindqvist@northwind.co')).toBeVisible()
    } finally {
      await screen.unmount()
    }
  })
})
