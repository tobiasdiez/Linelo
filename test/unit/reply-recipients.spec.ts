import { describe, expect, it } from 'vite-plus/test'
import inboxBuilders from '~/data/inbox-builders'
import participants from '#shared/utils/participants'
import replyAllRecipients from '#shared/utils/reply-all-recipients'

const { mailboxOwner: me, message, participant } = inboxBuilders
const lena = participant('Lena Hartmann')
const priya = participant('Priya Nair')
const marco = participant('Marco Bellini')

function emails(list: Inbox.Participant[]): string[] {
  return list.map(entry => entry.email)
}

describe('reply-all recipients', () => {
  it('replies to the sender and keeps everyone else, without me', () => {
    const recipients = replyAllRecipients(message({ from: lena, to: [me, priya], cc: [marco] }), me)

    expect(emails(recipients.to)).toStrictEqual([lena.email, priya.email])
    expect(emails(recipients.cc)).toStrictEqual([marco.email])
  })

  it('excludes me regardless of address case', () => {
    const shouting = { ...me, email: me.email.toUpperCase() }

    const recipients = replyAllRecipients(
      message({ from: lena, to: [shouting], cc: [shouting, marco] }),
      me,
    )

    expect(emails(recipients.to)).toStrictEqual([lena.email])
    expect(emails(recipients.cc)).toStrictEqual([marco.email])
  })

  it('does not list anyone twice', () => {
    const recipients = replyAllRecipients(
      message({ from: lena, to: [me, lena], cc: [lena, priya] }),
      me,
    )

    expect(emails(recipients.to)).toStrictEqual([lena.email])
    expect(emails(recipients.cc)).toStrictEqual([priya.email])
  })

  it('replies to the original recipients when I sent the message', () => {
    const recipients = replyAllRecipients(message({ from: me, to: [lena], cc: [priya] }), me)

    expect(emails(recipients.to)).toStrictEqual([lena.email])
    expect(emails(recipients.cc)).toStrictEqual([priya.email])
  })

  it('replies to the Reply-To addresses instead of the sender when the message has them', () => {
    const noReply = { name: 'Northwind Forms', email: 'no-reply@northwind.co' }

    const recipients = replyAllRecipients(
      message({ from: noReply, replyTo: [lena, me], to: [me], cc: [priya] }),
      me,
    )

    expect(emails(recipients.to)).toStrictEqual([lena.email])
    expect(emails(recipients.cc)).toStrictEqual([priya.email])
  })

  it('replies to the sender when no Reply-To entry has an address', () => {
    const recipients = replyAllRecipients(
      message({ from: lena, replyTo: [{ name: 'Lena', email: '' }], to: [me] }),
      me,
    )

    expect(emails(recipients.to)).toStrictEqual([lena.email])
  })

  it('leaves out participants without an address, and me', () => {
    const unknown = { name: 'Unknown sender', email: '' }
    const nameOnly = { name: 'Facilities', email: '' }

    const recipients = replyAllRecipients(
      message({ from: unknown, to: [me, nameOnly, lena], cc: [nameOnly, priya] }),
      me,
    )

    expect(emails(recipients.to)).toStrictEqual([lena.email])
    expect(emails(recipients.cc)).toStrictEqual([priya.email])
  })

  it('leaves out legacy Exchange addresses the server would refuse', () => {
    const legacy = {
      name: 'Jonas Weber',
      email: '/o=ExchangeLabs/ou=Exchange Administrative Group/cn=Recipients/cn=jonas',
    }

    expect(replyAllRecipients(message({ from: legacy, to: [me], cc: [priya] }), me)).toStrictEqual({
      to: [],
      cc: [priya],
    })
  })

  it('names a recipient whose name is too long to send by their address', () => {
    const longName = { name: 'Lena '.repeat(participants.maxNameLength), email: lena.email }

    expect(replyAllRecipients(message({ from: longName, to: [me] }), me).to).toStrictEqual([
      { name: lena.email, email: lena.email },
    ])
  })

  it('has no one to reply to for a note to myself', () => {
    expect(replyAllRecipients(message({ from: me, to: [me], cc: [] }), me)).toStrictEqual({
      to: [],
      cc: [],
    })
  })
})
