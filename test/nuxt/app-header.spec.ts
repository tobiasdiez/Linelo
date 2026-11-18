import { AppHeader, UApp } from '#components'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vite-plus/test'
import { page, userEvent } from 'vite-plus/test/browser'
import calendarBuilders from '~/data/calendar-builders'
import fakeCalendar from './fake-calendar-api'
import inboxBuilders from '~/data/inbox-builders'
import { render } from '@nuxt/test-utils/browser'
import stateKeys from '~/data/state-keys'

/** Renders the header alone, signed in, at `route`. */
async function renderHeader(route = '/') {
  useCurrentUser().set(inboxBuilders.signedInUser)
  clearNuxtState(
    Object.values(stateKeys).filter(key => key.startsWith('calendar-')),
    { reset: true },
  )
  return render(defineComponent({ render: () => h(UApp, () => h(AppHeader)) }), { route })
}

describe('app header', () => {
  it('shows who is signed in, and Sign out, in the account menu', async () => {
    expect.hasAssertions()
    const screen = await renderHeader()
    try {
      await page.getByRole('button', { name: 'Account: Mara Lindqvist' }).click()

      await expect.element(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible()
      await expect.element(page.getByText('mara.lindqvist@northwind.co')).toBeVisible()
    } finally {
      await screen.unmount()
    }
  })

  it.each([
    ['/', 'Inbox', 'Calendar'],
    ['/calendar', 'Calendar', 'Inbox'],
  ])('links both pages and marks %s as the current one', async (route, current, other) => {
    expect.hasAssertions()
    const screen = await renderHeader(route)
    try {
      const pages = page.getByRole('navigation', { name: 'Pages' })

      await expect
        .element(pages.getByRole('link', { name: current }))
        .toHaveAttribute('aria-current', 'page')
      await expect
        .element(pages.getByRole('link', { name: other }))
        .not.toHaveAttribute('aria-current')
    } finally {
      await screen.unmount()
    }
  })

  it('takes focus back to the account button when the picker opened from the menu closes', async () => {
    expect.hasAssertions()
    const api = fakeCalendar.api()
    const screen = await renderHeader()
    try {
      const account = page.getByRole('button', { name: 'Account: Mara Lindqvist' })
      await account.click()
      await page.getByRole('menuitem', { name: 'Calendars…' }).click()
      await expect.element(page.getByRole('dialog', { name: 'Calendars' })).toBeVisible()
      await userEvent.keyboard('{Escape}')

      await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
      await expect.element(account).toHaveFocus()
    } finally {
      await screen.unmount()
      await api.restore()
    }
  })

  it('opens the calendars from the account menu, and says when a change did not work', async () => {
    expect.hasAssertions()
    vi.spyOn(console, 'error').mockReturnValue()
    const api = fakeCalendar.api()
    api.addSource.answer = fakeCalendar.unavailableResponse
    const screen = await renderHeader()
    try {
      await page.getByRole('button', { name: 'Account: Mara Lindqvist' }).click()
      await page.getByRole('menuitem', { name: 'Calendars…' }).click()
      const picker = page.getByRole('dialog', { name: 'Calendars' })

      await expect
        .element(picker.getByText(calendarBuilders.calendarsListing().account.address.email))
        .toBeVisible()
      await expect.element(picker.getByRole('checkbox', { name: 'Robotics Club' })).toBeChecked()
      await picker.getByRole('checkbox', { name: 'Choir' }).click()

      await expect
        .element(page.getByText("Couldn't change your calendars. Try again."))
        .toBeVisible()
      await expect.element(picker.getByRole('checkbox', { name: 'Choir' })).not.toBeChecked()
    } finally {
      await screen.unmount()
      useToast().clear()
      await api.restore()
    }
  })

  it('stops suggesting from a calendar when it is unticked', async () => {
    expect.hasAssertions()
    const api = fakeCalendar.api()
    const screen = await renderHeader()
    try {
      useCalendarSources().openPicker(() => undefined)
      const picker = page.getByRole('dialog', { name: 'Calendars' })
      await picker.getByRole('checkbox', { name: 'Robotics Club' }).click()

      await vi.waitFor(() =>
        expect(api.requests.sourcesRemoved).toStrictEqual([calendarBuilders.sources.robotics.id]),
      )
      await expect
        .element(picker.getByRole('checkbox', { name: 'Robotics Club' }))
        .not.toBeChecked()
      expect(useCalendarSources().revision.value).toBe(1)
    } finally {
      await screen.unmount()
      await api.restore()
    }
  })

  it('offers to try again when the calendars did not load', async () => {
    expect.hasAssertions()
    vi.spyOn(console, 'error').mockReturnValue()
    const api = fakeCalendar.api()
    api.calendars.answer = fakeCalendar.unavailableResponse
    const screen = await renderHeader()
    try {
      useCalendarSources().openPicker(() => undefined)
      const picker = page.getByRole('dialog', { name: 'Calendars' })
      await expect.element(picker.getByText("Couldn't load your calendars.")).toBeVisible()
      api.calendars.answer = () => calendarBuilders.calendarsListing()
      await picker.getByRole('button', { name: 'Try again' }).click()

      await expect.element(picker.getByRole('checkbox', { name: 'Choir' })).toBeVisible()
    } finally {
      await screen.unmount()
      await api.restore()
    }
  })
})
