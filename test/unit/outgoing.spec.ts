import { describe, expect, it, vi } from 'vite-plus/test'
import MailError from '#server/mail/mail-error'
import emailAddress from '#shared/utils/email-address'
import mailFakes from './mail-fakes'
import outgoing from '#server/mail/outgoing'

const lena: Inbox.Participant = { name: 'Lena Hartmann', email: 'lena@northwind.co' }
const priya: Inbox.Participant = { name: 'Priya Nair', email: 'priya@northwind.co' }
const jonas: Inbox.Participant = { name: 'Jonas Weber', email: 'jonas@northwind.co' }
const MAX_TEXT = 100_000
const MAX_RECIPIENTS = 500
const MAX_MARK_AS_READ = 100
const tooLong = 'x'.repeat(emailAddress.maxLength + 1)

const replyRequest: Inbox.ReplyRequest = {
  accountId: 'office',
  messageId: 'm3',
  body: 'Thursday works.\n\nMara',
  to: [lena],
  cc: [priya],
  markAsRead: ['m2', 'm3'],
}

const forwardRequest: Inbox.ForwardRequest = {
  accountId: 'office',
  messageId: 'm3',
  to: [jonas],
  note: 'Can you take this?',
  markAsRead: ['m3'],
}

function people(count: number): Inbox.Participant[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `Person ${index}`,
    email: `person-${index}@northwind.co`,
  }))
}

function ids(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `m${index}`)
}

describe('outgoing mail: requests', () => {
  it.each([
    ['as it is', replyRequest],
    ['with nothing to mark as read', { ...replyRequest, markAsRead: [] }],
    ['at the longest', { ...replyRequest, body: 'x'.repeat(MAX_TEXT) }],
    ['to the most recipients', { ...replyRequest, cc: people(MAX_RECIPIENTS - 1) }],
  ])('accepts a reply %s', (_, body) => {
    expect(outgoing.validateReply(body)).toStrictEqual({ value: body })
  })

  it.each([
    ['accountId', 'an empty account', { ...replyRequest, accountId: '' }],
    ['messageId', 'no message', { ...replyRequest, messageId: undefined }],
    ['body', 'a blank body', { ...replyRequest, body: ' \n ' }],
    ['body', 'a body that is too long', { ...replyRequest, body: 'x'.repeat(MAX_TEXT + 1) }],
    ['body', 'a body that is not text', { ...replyRequest, body: 42 }],
    ['to', 'no one to reply to', { ...replyRequest, to: [] }],
    [
      'to',
      'an address with a space',
      { ...replyRequest, to: [{ ...lena, email: 'lena@north wind.co' }] },
    ],
    [
      'to',
      'an address with two @',
      { ...replyRequest, to: [{ ...lena, email: 'lena@@northwind.co' }] },
    ],
    [
      'to',
      'an Exchange address',
      { ...replyRequest, to: [{ ...lena, email: '/o=ExchangeLabs/cn=lena' }] },
    ],
    [
      'to',
      'an address that is too long',
      { ...replyRequest, to: [{ ...lena, email: `${tooLong}@northwind.co` }] },
    ],
    ['to', 'a name that is too long', { ...replyRequest, to: [{ ...lena, name: tooLong }] }],
    ['to', 'a recipient without a name', { ...replyRequest, to: [{ email: lena.email }] }],
    [
      'to',
      'a recipient with more than a name and address',
      { ...replyRequest, to: [{ ...lena, id: 1 }] },
    ],
    ['cc', 'too many recipients', { ...replyRequest, cc: people(MAX_RECIPIENTS) }],
    ['cc', 'no cc list', { ...replyRequest, cc: undefined }],
    [
      'markAsRead',
      'too many messages to mark',
      { ...replyRequest, markAsRead: ids(MAX_MARK_AS_READ + 1) },
    ],
    ['markAsRead', 'an empty message id', { ...replyRequest, markAsRead: [''] }],
    ['note', 'a field a reply does not have', { ...replyRequest, note: '' }],
    ['constructor', 'a field named like an Object method', { ...replyRequest, constructor: 'x' }],
    ['request', 'a list instead of an object', [replyRequest]],
    ['request', 'no object at all', 'reply'],
  ])('refuses a reply with a bad %s: %s', (field, _, body) => {
    expect(outgoing.validateReply(body)).toStrictEqual({ field })
  })

  it.each([
    ['as it is', forwardRequest],
    ['without a note', { ...forwardRequest, note: '' }],
    ['marking the most messages', { ...forwardRequest, markAsRead: ids(MAX_MARK_AS_READ) }],
  ])('accepts a forward %s', (_, body) => {
    expect(outgoing.validateForward(body)).toStrictEqual({ value: body })
  })

  it.each([
    ['to', 'one recipient that is not a list', { ...forwardRequest, to: jonas }],
    ['to', 'two recipients', { ...forwardRequest, to: [jonas, lena] }],
    ['to', 'no recipient', { ...forwardRequest, to: [] }],
    ['to', 'a malformed address', { ...forwardRequest, to: [{ ...jonas, email: 'jonas' }] }],
    ['note', 'no note', { ...forwardRequest, note: undefined }],
    ['note', 'a note that is too long', { ...forwardRequest, note: 'x'.repeat(MAX_TEXT + 1) }],
    ['messageId', 'an empty message', { ...forwardRequest, messageId: '' }],
    ['markAsRead', 'a single id instead of a list', { ...forwardRequest, markAsRead: 'm3' }],
    ['cc', 'a cc it would silently drop', { ...forwardRequest, cc: [lena] }],
  ])('refuses a forward with a bad %s: %s', (field, _, body) => {
    expect(outgoing.validateForward(body)).toStrictEqual({ field })
  })
})

/** Records `console.error` and keeps it out of the test output. */
function recordConsoleErrors() {
  vi.restoreAllMocks()
  return vi.spyOn(console, 'error').mockReturnValue()
}

describe('outgoing mail: sending', () => {
  it('replies from the mailbox of the account, then marks the thread as read', async () => {
    expect.hasAssertions()
    const personal = mailFakes.mailbox('personal')
    const office = mailFakes.mailbox('office')

    await outgoing.reply([personal, office], replyRequest)

    expect(office.provider.reply).toHaveBeenCalledExactlyOnceWith(office.connection, {
      messageId: 'm3',
      body: 'Thursday works.\n\nMara',
      to: [lena],
      cc: [priya],
    })
    expect(office.provider.setRead).toHaveBeenCalledExactlyOnceWith(
      office.connection,
      ['m2', 'm3'],
      true,
    )
    expect(office.provider.reply).toHaveBeenCalledBefore(office.provider.setRead)
    expect(personal.provider.reply).not.toHaveBeenCalled()
  })

  it('forwards with the note, then marks the thread as read, unless nothing was unread', async () => {
    expect.hasAssertions()
    const office = mailFakes.mailbox('office')

    await outgoing.forward([office], forwardRequest)
    await outgoing.forward([office], { ...forwardRequest, markAsRead: [] })

    expect(office.provider.forward).toHaveBeenCalledWith(office.connection, {
      messageId: 'm3',
      to: [jonas],
      note: 'Can you take this?',
    })
    expect(office.provider.forward).toHaveBeenCalledBefore(office.provider.setRead)
    expect(office.provider.setRead).toHaveBeenCalledExactlyOnceWith(office.connection, ['m3'], true)
  })

  it('still succeeds when marking as read fails after sending, and logs it', async () => {
    expect.hasAssertions()
    const error = recordConsoleErrors()
    const office = mailFakes.mailbox('office')
    const failure = new MailError('unavailable', 'Graph is down')
    office.provider.setRead.mockRejectedValue(failure)

    await outgoing.reply([office], replyRequest)
    await outgoing.forward([office], forwardRequest)

    expect(error.mock.calls).toStrictEqual([
      ['Marking the thread as read after sending failed', failure],
      ['Marking the thread as read after sending failed', failure],
    ])
  })

  it('marks nothing as read when sending failed', async () => {
    expect.hasAssertions()
    const office = mailFakes.mailbox('office')
    office.provider.reply.mockRejectedValue(new MailError('uncertain', 'Graph timed out'))
    office.provider.forward.mockRejectedValue(new MailError('unavailable', 'Graph said 503'))

    await expect(outgoing.reply([office], replyRequest)).rejects.toMatchObject({
      kind: 'uncertain',
    })
    await expect(outgoing.forward([office], forwardRequest)).rejects.toMatchObject({
      kind: 'unavailable',
    })
    expect(office.provider.setRead).not.toHaveBeenCalled()
  })

  it("refuses an account that is not one of the user's mailboxes", async () => {
    expect.hasAssertions()
    const personal = mailFakes.mailbox('personal')

    await expect(outgoing.reply([personal], replyRequest)).rejects.toMatchObject({
      kind: 'unknownAccount',
    })
    await expect(outgoing.forward([personal], forwardRequest)).rejects.toMatchObject({
      kind: 'unknownAccount',
    })
    expect(personal.provider.reply).not.toHaveBeenCalled()
  })

  it('asks to sign in again when the user has no mailbox at all', async () => {
    expect.hasAssertions()

    await expect(outgoing.reply([], replyRequest)).rejects.toMatchObject({ kind: 'reconnect' })
    await expect(outgoing.forward([], forwardRequest)).rejects.toMatchObject({
      kind: 'reconnect',
    })
  })
})
