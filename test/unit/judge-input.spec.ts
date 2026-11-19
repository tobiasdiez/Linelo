import { describe, expect, it } from 'vite-plus/test'
import judgeInput from '#server/ranking/judges/input'
import mailboxOwner from '#shared/data/mailbox-owner'
import rankingFakes from './ranking-fakes'

const { envelope, lena } = rankingFakes
const priya: Inbox.Participant = { name: 'Priya Nair', email: 'priya.nair@northwind.co' }
const jonas: Inbox.Participant = { name: 'Jonas Weber', email: 'jonas.weber@northwind.co' }

describe('ranking: what the judge is shown', () => {
  it("shows names, the sender's domain, how it is addressed, the subject and the complete text", () => {
    const input = judgeInput(
      envelope('m1', { cc: [priya, jonas], subject: 'Vendor review', text: 'Does Thursday work?' }),
      mailboxOwner,
    )

    expect(input).toStrictEqual({
      reader: 'Mara Lindqvist',
      from: { name: 'Lena Hartmann', domain: 'northwind.co' },
      addressed: 'to the reader alone, 2 others in Cc',
      subject: 'Vendor review',
      text: 'Does Thursday work?',
    })
    expect(JSON.stringify(input)).not.toContain('@')
  })

  it.each([
    [{ to: [mailboxOwner, priya] }, 'to the reader and 1 other'],
    [
      { to: [priya, jonas], cc: [mailboxOwner, lena] },
      'to 2 others, the reader in Cc, 1 other in Cc',
    ],
    [{ to: [], cc: [mailboxOwner] }, 'to nobody by name, the reader in Cc'],
    [{ to: [priya], cc: [] }, 'to 1 other, not to the reader'],
    [{ to: [], cc: [] }, 'to nobody by name, not to the reader'],
  ])('phrases the addressing: %o', (overrides, phrase) => {
    expect(judgeInput(envelope('m1', overrides), mailboxOwner).addressed).toBe(phrase)
  })

  it('never sends a name that is an address, and takes the preview when there is no text', () => {
    const input = judgeInput(
      envelope('m1', {
        from: { name: 'news@list.example', email: 'news@list.example' },
        text: '',
        preview: 'This week: fewer meetings.',
      }),
      mailboxOwner,
    )

    expect([input.from, input.text]).toStrictEqual([
      { name: '', domain: 'list.example' },
      'This week: fewer meetings.',
    ])
  })
})
