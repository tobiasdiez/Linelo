import { describe, expect, it } from 'vite-plus/test'
import formatRecipients from '~/utils/format-recipients'
import inboxBuilders from '~/data/inbox-builders'

const { participant } = inboxBuilders
const lena = participant('Lena Hartmann')
const priya = participant('Priya Nair')
const marco = participant('Marco Bellini')

describe('recipient labels', () => {
  it('lists full names in to and first names in cc', () => {
    const labels = formatRecipients({ to: [lena], cc: [priya, marco] })

    expect(labels.to).toBe('Lena Hartmann')
    expect(labels.cc).toBe('Priya, Marco')
  })

  it('summarizes as the first recipient and a count of the rest', () => {
    expect(formatRecipients({ to: [lena], cc: [] }).summary).toBe('Lena Hartmann')
    expect(formatRecipients({ to: [lena], cc: [priya] }).summary).toBe('Lena Hartmann and 1 other')
    expect(formatRecipients({ to: [lena, priya], cc: [marco] }).summary).toBe(
      'Lena Hartmann and 2 others',
    )
  })
})
