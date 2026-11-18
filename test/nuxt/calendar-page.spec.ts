import { describe, expect, it, vi } from 'vite-plus/test'
import { page, userEvent } from 'vite-plus/test/browser'
import calendarBuilders from '~/data/calendar-builders'
import calendarClock from '~/utils/calendar-clock'
import fakeCalendar from './fake-calendar-api'
import httpStatus from '#shared/utils/http-status'
import inboxBuilders from '~/data/inbox-builders'
import microsoftSignIn from '~/utils/microsoft-sign-in'
import renderApp from './render-app'
import stateKeys from '~/data/state-keys'

type FakeCalendarApi = ReturnType<typeof fakeCalendar.api>

const { stories, storyWeek, instantsOf, sources } = calendarBuilders
const NEXT_MONDAY = '2026-11-23'
const LARGE = { width: 1280, height: 900 }
const SMALL = { width: 600, height: 900 }
/** Thursday ends the week's rows: a copy and two suggestions. */
const THURSDAY_ROWS = 3
/** The offsite runs from Friday to Sunday. */
const OFFSITE_DAYS = 3
const calendarKeys = Object.values(stateKeys).filter(key => key.startsWith('calendar-'))

/**
 * Signs in, pins the clock to Tuesday morning in Berlin, fakes the calendar API, renders
 * the calendar page at `route`, runs the test body, and cleans up.
 */
async function withCalendar(
  run: (api: FakeCalendarApi) => Promise<void>,
  {
    route = '/calendar',
    prepare,
    viewport = LARGE,
  }: { route?: string; prepare?: (api: FakeCalendarApi) => void; viewport?: typeof LARGE } = {},
): Promise<void> {
  vi.restoreAllMocks()
  vi.spyOn(calendarClock, 'now').mockReturnValue(calendarBuilders.now)
  vi.spyOn(calendarClock, 'timeZone').mockReturnValue(calendarBuilders.timeZone)
  await page.viewport(viewport.width, viewport.height)
  clearNuxtState(calendarKeys, { reset: true })
  useCurrentUser().set(inboxBuilders.signedInUser)
  const api = fakeCalendar.api()
  prepare?.(api)
  const screen = await renderApp(route)
  try {
    await run(api)
  } finally {
    await screen.unmount()
    useToast().clear()
    await api.restore()
    await page.viewport(LARGE.width, LARGE.height)
  }
}

function heading(): ReturnType<typeof page.getByRole> {
  return page.getByRole('heading', { level: 1 })
}

function dayHeadings(): string[] {
  return page
    .getByRole('heading', { level: 2 })
    .elements()
    .map(element => element.textContent?.trim() ?? '')
}

/** The button that makes a suggestion active, by its title. */
function suggestionRow(title: string): ReturnType<typeof page.getByRole> {
  return page.getByRole('button', { name: new RegExp(`^Suggested from .*${title}`) })
}

function rowTexts(): string[] {
  return page
    .getByRole('main')
    .getByRole('listitem')
    .elements()
    .map(element =>
      // The rendered text, with the gaps the grid puts between time and title
      // eslint-disable-next-line unicorn/prefer-dom-node-text-content
      element instanceof HTMLElement ? element.innerText.replaceAll(/\s+/g, ' ').trim() : '',
    )
}

describe('calendar page', () => {
  it('shows own events and suggestions under their days, with free days collapsed and today kept', async () => {
    expect.hasAssertions()

    await withCalendar(async api => {
      await expect.element(heading()).toHaveTextContent('16 – 22 November 2026')
      await expect.element(page.getByText('Build night', { exact: true })).toBeVisible()

      expect(dayHeadings()).toStrictEqual([
        'Monday 16 Nov',
        'Tuesday 17 Nov · Today',
        'Wednesday 18 Nov',
        'Thursday 19 Nov',
        'Friday 20 – Sunday 22 Nov',
      ])
      expect(rowTexts().slice(-THURSDAY_ROWS)).toStrictEqual([
        expect.stringMatching(/^10:00 – 11:00 Weekly sync · Robotics Club/),
        expect.stringMatching(
          /10:30 – 11:30 Optics talk · every 2 weeks on Thursday · Department seminar/,
        ),
        expect.stringMatching(/18:00 – 20:00 Build night · Robotics Club/),
      ])
      expect(api.requests.weeks).toStrictEqual([instantsOf(calendarBuilders.monday)])
      // After the week: both would wait in the same mailbox queue otherwise
      await vi.waitFor(() => expect(api.requests.syncs).toBe(1))
      await expect.element(page.getByText('More suggestions in later weeks.')).toBeVisible()
    })
  })

  it('keeps today as its own day when it is free', async () => {
    expect.hasAssertions()

    await withCalendar(
      async () => {
        await expect.element(page.getByText('Free').first()).toBeVisible()

        expect(dayHeadings()).toStrictEqual([
          'Monday 16 Nov',
          'Tuesday 17 Nov · Today',
          'Wednesday 18 – Sunday 22 Nov',
        ])
      },
      {
        prepare: api => {
          api.week.answer = () => ({ ...fakeCalendar.emptyWeek(), events: [stories.lena] })
        },
      },
    )
  })

  it('makes the first suggestion active with its buttons, and a clicked one active instead', async () => {
    expect.hasAssertions()

    await withCalendar(async () => {
      await expect.element(suggestionRow('Rehearsal')).toHaveAttribute('aria-current', 'true')
      await expect.element(suggestionRow('Build night')).not.toHaveAttribute('aria-current')
      await expect.element(page.getByRole('button', { name: 'Accept Rehearsal' })).toBeVisible()
      expect(page.getByRole('button', { name: /^Accept / }).elements()).toHaveLength(1)
      await expect
        .element(
          page.getByRole('button', {
            name: /Optics talk.*overlaps with an event in your calendar/,
          }),
        )
        .toBeVisible()

      await suggestionRow('Build night').click()

      await expect.element(suggestionRow('Build night')).toHaveAttribute('aria-current', 'true')
      await expect.element(suggestionRow('Rehearsal')).not.toHaveAttribute('aria-current')
      await expect
        .element(page.getByRole('button', { name: 'Not for me: Build night' }))
        .toBeVisible()
      // One line, active or not: no place, no more than the inactive rows show
      expect(suggestionRow('Build night').element().textContent).not.toContain('Lab 2')
    })
  })

  it('accepts the active suggestion on a: the copy takes its place, the next one gets focus, Undo is offered', async () => {
    expect.hasAssertions()

    await withCalendar(async api => {
      await suggestionRow('Build night').click()
      await suggestionRow('Optics talk').click()
      await suggestionRow('Build night').click()
      await userEvent.keyboard('a')

      await expect.element(page.getByText('Accepted: Build night')).toBeVisible()
      await expect.element(suggestionRow('Build night')).not.toBeInTheDocument()
      await expect.element(suggestionRow('Rehearsal')).toHaveFocus()
      await expect.element(suggestionRow('Rehearsal')).toHaveAttribute('aria-current', 'true')

      expect(rowTexts().at(-1)).toMatch(/^18:00 – 20:00 Build night · Lab 2 · Robotics Club/)
      expect(api.requests.decisions).toStrictEqual([
        { sourceId: sources.robotics.id, eventId: 'build-night', decision: 'accept' },
      ])
    })
  })

  it('dismisses on n, and Undo brings the suggestion back as the active one', async () => {
    expect.hasAssertions()

    await withCalendar(async api => {
      await expect.element(suggestionRow('Rehearsal')).toHaveAttribute('aria-current', 'true')
      await userEvent.keyboard('n')
      await expect.element(page.getByText('Not for me: Rehearsal')).toBeVisible()
      await expect.element(suggestionRow('Rehearsal')).not.toBeInTheDocument()
      await expect.element(suggestionRow('Optics talk')).toHaveAttribute('aria-current', 'true')

      await page.getByRole('button', { name: 'Undo' }).click()

      // First that the click reached the app, so a failure below says which half failed
      await expect.poll(() => api.requests.undos).toStrictEqual(['decision-1'])
      await expect.element(suggestionRow('Rehearsal')).toHaveAttribute('aria-current', 'true')
      await expect.element(suggestionRow('Rehearsal')).toHaveFocus()
      expect(api.requests.decisions).toStrictEqual([
        { sourceId: sources.choir.id, eventId: 'rehearsal-series', decision: 'dismiss' },
      ])
    })
  })

  it('takes an accepted copy away again on Undo', async () => {
    expect.hasAssertions()

    await withCalendar(async api => {
      await suggestionRow('Build night').click()
      await userEvent.keyboard('a')
      await expect.element(page.getByText('Accepted: Build night')).toBeVisible()
      await page.getByRole('button', { name: 'Undo' }).click()

      await expect.poll(() => api.requests.undos).toStrictEqual(['decision-1'])
      await expect.element(suggestionRow('Build night')).toHaveAttribute('aria-current', 'true')
      // The copy's row fades out (a transition) before it leaves the list
      await expect
        .poll(() => rowTexts().filter(text => text.includes('Build night')))
        .toHaveLength(1)
    })
  })

  it('keeps the suggestion when the decision fails, and says so', async () => {
    expect.hasAssertions()
    vi.spyOn(console, 'error').mockReturnValue()

    await withCalendar(
      async () => {
        await expect.element(suggestionRow('Rehearsal')).toHaveAttribute('aria-current', 'true')
        await userEvent.keyboard('a')

        await expect.element(page.getByText("Couldn't accept this. Try again.")).toBeVisible()
        await expect.element(suggestionRow('Rehearsal')).toHaveAttribute('aria-current', 'true')
      },
      {
        prepare: api => {
          api.decide.answer = fakeCalendar.unavailableResponse
        },
      },
    )
  })

  it('says when trying to undo failed', async () => {
    expect.hasAssertions()
    vi.spyOn(console, 'error').mockReturnValue()

    await withCalendar(async api => {
      api.undo.answer = fakeCalendar.unavailableResponse
      await userEvent.keyboard('n')
      await page.getByRole('button', { name: 'Undo' }).click()

      await expect.element(page.getByText("Couldn't undo that.")).toBeVisible()
      await expect.element(suggestionRow('Rehearsal')).not.toBeInTheDocument()
    })
  })

  it('moves between weeks with the arrow keys, through the URL, and focuses the range', async () => {
    expect.hasAssertions()

    await withCalendar(async api => {
      await expect.element(heading()).toHaveTextContent('16 – 22 November 2026')
      await userEvent.keyboard('{ArrowRight}')

      await expect.element(heading()).toHaveTextContent('23 – 29 November 2026')
      await expect.element(heading()).toHaveFocus()
      expect(useRoute().query.week).toBe(NEXT_MONDAY)
      await expect.element(page.getByText('Nothing new from your other calendars.')).toBeVisible()

      await page.getByRole('button', { name: 'Today' }).click()

      await expect.element(heading()).toHaveTextContent('16 – 22 November 2026')
      expect(useRoute().query.week).toBeUndefined()
      await userEvent.keyboard('{ArrowLeft}')
      await expect.element(heading()).toHaveTextContent('9 – 15 November 2026')
      expect(api.requests.weeks.map(range => range.from)).toStrictEqual([
        instantsOf(calendarBuilders.monday).from,
        instantsOf(NEXT_MONDAY).from,
        instantsOf(calendarBuilders.monday).from,
        instantsOf('2026-11-09').from,
      ])
    })
  })

  it('opens the week of ?week=, normalised to its Monday', async () => {
    expect.hasAssertions()

    await withCalendar(
      async api => {
        await expect.element(heading()).toHaveTextContent('23 – 29 November 2026')
        await vi.waitFor(() => expect(useRoute().query.week).toBe(NEXT_MONDAY))
        expect(api.requests.weeks).toStrictEqual([instantsOf(NEXT_MONDAY)])
      },
      { route: '/calendar?week=2026-11-26' },
    )
  })

  it('names unreachable calendars, and offers to try again when none answered', async () => {
    expect.hasAssertions()
    const tried = { again: false }

    await withCalendar(
      async () => {
        await expect.element(page.getByText("Couldn't reach your other calendars.")).toBeVisible()
        tried.again = true
        await page.getByRole('button', { name: 'Try again' }).click()

        await expect.element(page.getByText("Choir couldn't be reached.")).toBeVisible()
        await expect.element(page.getByText('Rehearsal')).not.toBeInTheDocument()
      },
      {
        prepare: api => {
          api.week.answer = () =>
            tried.again
              ? storyWeek({ suggestions: [stories.buildNight], unreachable: ['Choir'] })
              : storyWeek({
                  suggestions: [],
                  unreachable: ['Robotics Club', 'Department seminar', 'Choir'],
                })
        },
      },
    )
  })

  it('tells about copies the sync removed, and fetches the week again', async () => {
    expect.hasAssertions()

    await withCalendar(
      async api => {
        await expect
          .element(page.getByText('Removed from your calendar: Weekly sync'))
          .toBeVisible()
        await expect.element(page.getByText('Cancelled in Robotics Club.')).toBeVisible()
        await vi.waitFor(() => expect(api.requests.weeks).toHaveLength(2))
      },
      {
        prepare: api => {
          api.sync.answer = () => ({
            updated: 0,
            removed: [{ title: 'Weekly sync', source: 'Robotics Club' }],
            unreachable: [],
          })
        },
      },
    )
  })

  it('offers to choose calendars when none are chosen, and fetches the week again after a choice', async () => {
    expect.hasAssertions()

    await withCalendar(
      async api => {
        await page.getByRole('button', { name: 'Choose calendars' }).click()
        const picker = page.getByRole('dialog', { name: 'Calendars' })
        await expect.element(picker.getByText('Calendar', { exact: true })).toBeVisible()
        await picker.getByRole('checkbox', { name: 'Choir' }).click()

        await vi.waitFor(() =>
          expect(api.requests.sourcesAdded).toStrictEqual([
            { kind: 'outlook', externalId: 'calendar-choir' },
          ]),
        )
        await vi.waitFor(() => expect(api.requests.weeks).toHaveLength(2))
        await picker.getByRole('button', { name: 'Done' }).click()
        await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
      },
      {
        prepare: api => {
          api.week.answer = () => storyWeek({ suggestions: [], moreLater: false, sourceCount: 0 })
        },
      },
    )
  })

  it('keeps the shortcuts still while the picker is open', async () => {
    expect.hasAssertions()

    await withCalendar(async api => {
      await expect.element(suggestionRow('Rehearsal')).toHaveAttribute('aria-current', 'true')
      await page.getByRole('button', { name: 'Account: Mara Lindqvist' }).click()
      await page.getByRole('menuitem', { name: 'Calendars…' }).click()
      await expect.element(page.getByRole('dialog', { name: 'Calendars' })).toBeVisible()
      await userEvent.keyboard('a')
      await userEvent.keyboard('{ArrowRight}')
      await userEvent.keyboard('{Escape}')

      await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
      await expect.element(heading()).toHaveTextContent('16 – 22 November 2026')
      expect(api.requests.decisions).toStrictEqual([])
    })
  })

  it('offers to try again when the week did not load', async () => {
    expect.hasAssertions()
    vi.spyOn(console, 'error').mockReturnValue()

    await withCalendar(
      async api => {
        await expect.element(heading()).toHaveTextContent("Your calendar didn't load.")
        api.week.answer = () => storyWeek()
        await page.getByRole('button', { name: 'Try again' }).click()

        await expect.element(heading()).toHaveTextContent('16 – 22 November 2026')
      },
      {
        prepare: api => {
          api.week.answer = fakeCalendar.unavailableResponse
        },
      },
    )
  })

  it('puts the buttons in the bar at the bottom below lg', async () => {
    expect.hasAssertions()

    await withCalendar(
      async api => {
        const bar = page.getByRole('region', { name: 'Suggestion' })
        await expect.element(bar.getByText('Rehearsal', { exact: true })).toBeVisible()
        await expect.element(bar.getByText(/Wed 19:00 – 21:00/)).toBeVisible()
        await bar.getByRole('button', { name: 'Not for me: Rehearsal' }).click()

        await expect.element(bar.getByText('Optics talk', { exact: true })).toBeVisible()
        await expect.element(bar.getByText(/Thu 10:30 – 11:30/)).toBeVisible()
        expect(api.requests.decisions).toHaveLength(1)
      },
      { viewport: SMALL },
    )
  })

  it('asks to allow calendar access when Linelo has none, through the sign-in with Microsoft', async () => {
    expect.hasAssertions()
    // Leaving for Microsoft fails here, which keeps the test on the page
    const start = vi.fn<typeof microsoftSignIn.start>().mockRejectedValue(new Error('Network down'))

    await withCalendar(
      async () => {
        await expect
          .element(heading())
          .toHaveTextContent("Linelo doesn't have access to your calendar.")
        await page.getByRole('button', { name: 'Allow calendar access' }).click()

        await expect.element(page.getByText("That didn't work. Try again.")).toBeVisible()
        expect(start).toHaveBeenCalledExactlyOnceWith('/calendar')
        // Back to the calendar either way: with access, or with `?error=`
        expect(microsoftSignIn.optionsFor('/calendar')).toStrictEqual({
          provider: 'microsoft',
          callbackURL: '/calendar',
          errorCallbackURL: '/calendar',
        })
      },
      {
        prepare: api => {
          api.week.answer = fakeCalendar.consentResponse
          vi.spyOn(console, 'error').mockReturnValue()
          vi.spyOn(microsoftSignIn, 'start').mockImplementation(start)
        },
      },
    )
  })

  it('says quietly that allowing access was cancelled', async () => {
    expect.hasAssertions()

    await withCalendar(
      async () => {
        await expect
          .element(page.getByText("Allowing access was cancelled. Continue whenever you're ready."))
          .toBeVisible()
        await expect.element(page.getByRole('status').first()).toHaveFocus()
      },
      {
        route: '/calendar?error=access_denied',
        prepare: api => {
          api.week.answer = fakeCalendar.consentResponse
        },
      },
    )
  })

  it('lets a suggestion decided in another tab go quietly, and fetches the week again', async () => {
    expect.hasAssertions()
    vi.spyOn(console, 'error').mockReturnValue()

    await withCalendar(
      async api => {
        await expect.element(suggestionRow('Rehearsal')).toHaveAttribute('aria-current', 'true')
        await userEvent.keyboard('a')

        await expect.element(suggestionRow('Rehearsal')).not.toBeInTheDocument()
        await expect.element(suggestionRow('Optics talk')).toHaveAttribute('aria-current', 'true')
        await vi.waitFor(() => expect(api.requests.weeks).toHaveLength(2))
        expect(page.getByText("Couldn't accept this. Try again.").elements()).toStrictEqual([])
      },
      {
        prepare: api => {
          api.decide.answer = () =>
            Response.json(
              { statusCode: httpStatus.conflict, statusMessage: 'Decided already' },
              { status: httpStatus.conflict },
            )
          const first = api.week.answer
          // The other tab's decision: the second answer no longer has the series
          let answers = 0
          api.week.answer = range => {
            answers += 1
            return answers === 1
              ? first(range)
              : storyWeek({ suggestions: [stories.opticsTalk, stories.buildNight] })
          }
        },
      },
    )
  })

  it('accepts a series, and fetches the week again for its copied occurrences', async () => {
    expect.hasAssertions()

    await withCalendar(
      async api => {
        await expect.element(suggestionRow('Rehearsal')).toHaveAttribute('aria-current', 'true')
        await userEvent.keyboard('a')

        await expect.element(page.getByText('Accepted: Rehearsal')).toBeVisible()
        await expect.element(page.getByText('Rehearsal', { exact: true })).toBeVisible()
        expect(api.requests.decisions).toStrictEqual([
          { sourceId: sources.choir.id, eventId: 'rehearsal-series', decision: 'accept' },
        ])
        expect(api.requests.weeks).toHaveLength(2)
        await expect.element(suggestionRow('Rehearsal')).not.toBeInTheDocument()
      },
      {
        prepare: api => {
          let answers = 0
          api.week.answer = () => {
            answers += 1
            const copy = calendarBuilders.event({
              ...stories.rehearsal.event,
              id: 'copy-rehearsal-1',
              seriesMasterId: 'copy-rehearsal',
              source: { name: 'Choir' },
            })
            return answers === 1
              ? storyWeek()
              : storyWeek({
                  events: [...storyWeek().events, copy],
                  suggestions: [stories.opticsTalk, stories.buildNight],
                })
          }
        },
      },
    )
  })

  it('keeps the Undo toast when Escape is pressed elsewhere', async () => {
    expect.hasAssertions()

    await withCalendar(async () => {
      await userEvent.keyboard('n')
      await expect.element(page.getByText('Not for me: Rehearsal')).toBeVisible()
      await userEvent.keyboard('{Escape}')

      await expect.element(page.getByRole('button', { name: 'Undo' })).toBeVisible()
    })
  })

  it('says when trying again failed too, and keeps the failed state in place while it tries', async () => {
    expect.hasAssertions()
    vi.spyOn(console, 'error').mockReturnValue()

    await withCalendar(
      async api => {
        const tryAgain = page.getByRole('button', { name: 'Try again' })
        await expect.element(heading()).toHaveTextContent("Your calendar didn't load.")
        const gate = Promise.withResolvers<Response>()
        api.week.answer = () => gate.promise
        await tryAgain.click()

        // Still the failed state while trying, not the skeleton of the week
        await expect.element(heading()).toHaveTextContent("Your calendar didn't load.")
        gate.resolve(fakeCalendar.unavailableResponse())

        await expect.element(page.getByText("Still can't reach your calendar.")).toBeVisible()
        await expect.element(tryAgain).toHaveFocus()
      },
      {
        prepare: api => {
          api.week.answer = fakeCalendar.unavailableResponse
        },
      },
    )
  })

  it('shows an event over several days on each of them', async () => {
    expect.hasAssertions()

    await withCalendar(
      async () => {
        await expect.element(page.getByText('Free', { exact: true }).first()).toBeVisible()

        expect(dayHeadings().slice(-OFFSITE_DAYS)).toStrictEqual([
          'Friday 20 Nov',
          'Saturday 21 Nov',
          'Sunday 22 Nov',
        ])
        expect(rowTexts().slice(-OFFSITE_DAYS)).toStrictEqual([
          expect.stringMatching(/^09:00 → 22 Nov Team offsite · Lisbon/),
          expect.stringMatching(/^All day Team offsite · continued · Lisbon/),
          expect.stringMatching(/^until 16:00 Team offsite · continued · Lisbon/),
        ])
      },
      {
        prepare: api => {
          api.week.answer = () => storyWeek({ events: [stories.offsite], suggestions: [] })
        },
      },
    )
  })

  it('keeps focus on the arrow it was moved with, and says which week it is', async () => {
    expect.hasAssertions()

    await withCalendar(async () => {
      const next = page.getByRole('button', { name: 'Next week' })
      await expect.element(heading()).toHaveTextContent('16 – 22 November 2026')
      await next.click()

      await expect.element(heading()).toHaveTextContent('23 – 29 November 2026')
      await expect.element(next).toHaveFocus()
      await expect
        .element(page.getByRole('status').getByText('23 – 29 November 2026'))
        .toBeInTheDocument()
    })
  })

  it('takes focus back to the range when the picker opened from the callout closes', async () => {
    expect.hasAssertions()

    await withCalendar(
      async () => {
        await page.getByRole('button', { name: 'Choose calendars' }).click()
        const picker = page.getByRole('dialog', { name: 'Calendars' })
        await picker.getByRole('button', { name: 'Done' }).click()

        await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
        await expect.element(heading()).toHaveFocus()
      },
      {
        prepare: api => {
          api.week.answer = () => storyWeek({ suggestions: [], moreLater: false, sourceCount: 0 })
        },
      },
    )
  })

  it('does not sync when the week did not load, or Linelo has no calendar access', async () => {
    expect.hasAssertions()
    vi.spyOn(console, 'error').mockReturnValue()

    for (const answer of [fakeCalendar.unavailableResponse, fakeCalendar.consentResponse]) {
      // eslint-disable-next-line eslint/no-await-in-loop
      await withCalendar(
        async api => {
          await expect.element(heading()).not.toHaveTextContent('16 – 22 November 2026')
          await expect
            .element(page.getByRole('button', { name: /Try again|Allow calendar access/ }))
            .toBeVisible()

          expect(api.requests.syncs).toBe(0)
        },
        {
          prepare: api => {
            api.week.answer = answer
          },
        },
      )
    }
  })

  it('shows how a series repeats in its active row and in the bar, before the source', async () => {
    expect.hasAssertions()

    await withCalendar(
      async () => {
        const bar = page.getByRole('region', { name: 'Suggestion' })
        await expect.element(suggestionRow('Rehearsal')).toHaveAttribute('aria-current', 'true')

        expect(suggestionRow('Rehearsal').element().textContent?.replaceAll(/\s+/g, ' ')).toContain(
          'Rehearsal · every Wednesday · Choir',
        )
        await expect
          .element(page.getByTitle('Rehearsal · every Wednesday · Choir'))
          .toBeInTheDocument()
        await expect.element(bar.getByText('every Wednesday · Wed 19:00 – 21:00')).toBeVisible()
        await expect.element(bar.getByText('· Choir')).toBeVisible()
      },
      { viewport: SMALL },
    )
  })
})
