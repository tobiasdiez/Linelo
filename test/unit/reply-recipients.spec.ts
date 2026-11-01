import { describe, expect, it } from 'vite-plus/test'
import inboxBuilders from '~/data/inbox-builders'
import replyAllRecipients from '#shared/utils/reply-all-recipients'

const { currentUser: me, message, participant } = inboxBuilders
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
})
