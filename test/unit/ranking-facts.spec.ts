import { describe, expect, it } from 'vite-plus/test'
import facts from '#server/ranking/facts'
import mailboxOwner from '#shared/data/mailbox-owner'
import rankingFakes from './ranking-fakes'

const { envelope, key, lena } = rankingFakes
const priya: Inbox.Participant = { name: 'Priya Nair', email: 'priya.nair@northwind.co' }
const jonas: Inbox.Participant = { name: 'Jonas Weber', email: 'jonas.weber@northwind.co' }
const LONG_TEXT = 1501

function factsOf(overrides: Partial<Mail.Envelope> = {}, owner = mailboxOwner): Ranking.Facts {
  return facts.of(envelope('m1', overrides), { owner, key })
}

describe('ranking: facts', () => {
  it('keeps no address, only a keyed hash of the sender', () => {
    const found = factsOf()

    expect(found.senderKey).toBe(key.hash('LENA.HARTMANN@northwind.co'))
    expect(JSON.stringify(found)).not.toContain('@')
  })

  it.each([
    ['alone', { to: [mailboxOwner], cc: [priya] }],
    ['withOthers', { to: [priya, { ...mailboxOwner, email: 'MARA.Lindqvist@northwind.co' }] }],
    ['cc', { to: [priya], cc: [mailboxOwner] }],
    ['none', { to: [priya], cc: [jonas] }],
  ] satisfies [Ranking.Facts['addressing'], Partial<Mail.Envelope>][])(
    'tells how the mail is addressed: %s',
    (addressing, overrides) => {
      expect(factsOf(overrides).addressing).toBe(addressing)
    },
  )

  it('knows the same organisation, but not by a public mail provider', () => {
    const gmailOwner = { name: 'Mara', email: 'mara@gmail.com' }
    const ben = { name: 'Ben', email: 'ben@other.example' }

    expect([
      factsOf().sameOrganisation,
      factsOf({ from: ben }).sameOrganisation,
      factsOf({ from: { name: 'Ben', email: 'ben@gmail.com' } }, gmailOwner).sameOrganisation,
    ]).toStrictEqual([true, false, false])
  })

  it.each([
    ['no-reply@parcelpost.example', true],
    ['noreply+1234@github.com', true],
    ['DoNotReply@bank.example', true],
    ['notifications@tool.example', true],
    ['notification@tool.example', true],
    ['MAILER-DAEMON@mail.example', true],
    ['bounce-7781@list.example', true],
    ['replying@northwind.co', false],
    ['lena.hartmann@northwind.co', false],
  ])('tells an automated sender address: %s', (email, automated) => {
    expect(factsOf({ from: { name: 'Sender', email } }).automatedAddress).toBe(automated)
  })

  it.each([
    ['English "now" in the text', { text: 'Could you tell me today?' }, 'now'],
    ['English "now" in the subject', { subject: 'URGENT: invoice' }, 'now'],
    ['English "days" in the text', { text: 'The hold ends on Friday.' }, 'days'],
    ['German "now" in the text', { text: 'Bitte heute noch freigeben.' }, 'now'],
    ['German "days" in the text', { text: 'Bis Donnerstag, bitte.' }, 'days'],
    ['German tomorrow', { text: 'Das brauche ich morgen.' }, 'days'],
    ['German morning', { text: 'Guten Morgen, alles klar.' }, 'none'],
    ['the preview when there is no text', { text: '', preview: 'Needed ASAP.' }, 'now'],
    ['no time words', { text: 'Staging is back up after this morning.' }, 'none'],
    ['parts of words only', { text: 'Todays notes, sundays, fristlos.' }, 'none'],
  ] satisfies [string, Partial<Mail.Envelope>, Ranking.Facts['timeWords']][])(
    'finds time words: %s',
    (_, overrides, expected) => {
      expect(factsOf(overrides).timeWords).toBe(expected)
    },
  )

  it('takes over the marks', () => {
    const found = factsOf({
      marks: { unsubscribable: true, importance: 'low', flagged: true, sorting: 'other' },
    })
    const unknown = factsOf({ marks: { importance: 'normal', flagged: false } })

    expect(found).toMatchObject({
      unsubscribable: true,
      importance: 'low',
      flagged: true,
      sorting: 'other',
    })
    expect([unknown.unsubscribable, unknown.sorting]).toStrictEqual([undefined, undefined])
  })

  it('calls a long text or many recipients heavy', () => {
    const many = [
      priya,
      jonas,
      lena,
      { name: 'A', email: 'a@x.example' },
      { name: 'B', email: 'b@x.example' },
    ]

    expect([
      factsOf({ text: 'x'.repeat(LONG_TEXT) }).heavy,
      factsOf({ cc: many }).heavy,
      factsOf({ cc: many.slice(1) }).heavy,
    ]).toStrictEqual([true, true, false])
  })
})
