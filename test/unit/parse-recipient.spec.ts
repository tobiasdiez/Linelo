import { describe, expect, it } from 'vite-plus/test'
import emailAddress from '#shared/utils/email-address'
import inboxBuilders from '~/data/inbox-builders'
import parseRecipient from '~/utils/parse-recipient'
import participants from '#shared/utils/participants'

const jonas = inboxBuilders.participant('Jonas Weber')

describe('forward recipient', () => {
  it("takes a thread participant's name for a bare address, in any case", () => {
    expect(parseRecipient('  JONAS.WEBER@northwind.co ', [jonas])).toStrictEqual({
      name: 'Jonas Weber',
      email: 'JONAS.WEBER@northwind.co',
    })
  })

  it('names an unknown address after the address itself', () => {
    expect(parseRecipient('ops@example.com', [jonas])).toStrictEqual({
      name: 'ops@example.com',
      email: 'ops@example.com',
    })
  })

  it('reads "Name <address>", with or without quotes around the name', () => {
    expect(parseRecipient('Jonas W. <jonas.weber@northwind.co>', [jonas])).toStrictEqual({
      name: 'Jonas W.',
      email: 'jonas.weber@northwind.co',
    })
    expect(parseRecipient('"Weber, Jonas" <jonas@example.com>')).toStrictEqual({
      name: 'Weber, Jonas',
      email: 'jonas@example.com',
    })
    expect(parseRecipient('<jonas.weber@northwind.co>', [jonas])).toStrictEqual(jonas)
  })

  it('names the recipient by the address when the typed name is too long to send', () => {
    const longName = 'J'.repeat(participants.maxNameLength + 1)

    expect(parseRecipient(`${longName} <jonas@example.com>`)).toStrictEqual({
      name: 'jonas@example.com',
      email: 'jonas@example.com',
    })
  })

  it('refuses anything that is not an address', () => {
    const typed = [
      '',
      'jonas',
      'jonas@',
      '@northwind.co',
      'jonas weber@northwind.co',
      'jonas@@northwind.co',
      // Typed in a hurry: the domain is not complete
      'jonas@northwind',
      'jonas@northwind.',
      'jonas@.co',
      'Jonas <jonas>',
      'Jonas <jonas@northwind.co',
      `${'a'.repeat(emailAddress.maxLength)}@northwind.co`,
    ]

    expect(typed.map(text => parseRecipient(text, [jonas]))).toStrictEqual(
      typed.map(() => undefined),
    )
  })
})
