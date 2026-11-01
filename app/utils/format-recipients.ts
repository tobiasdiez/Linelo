interface FormattedRecipients {
  /** Full names of the "to" recipients, for example "Lena Hartmann". */
  to: string
  /** First names of the "cc" recipients, for example "Priya, Marco". */
  cc: string
  /** The first recipient plus a count of the rest, for example "Lena Hartmann and 2 others". */
  summary: string
}

function firstName(participant: Inbox.Participant): string {
  return participant.name.split(' ')[0] ?? participant.name
}

/** Recipient labels for the reply composer and its confirmation. */
function formatRecipients({ to, cc }: Inbox.ReplyRecipients): FormattedRecipients {
  const [first] = to
  const others = to.length + cc.length - 1
  let summary = first?.name ?? ''
  if (others > 0) {
    summary = `${summary} and ${others} ${others === 1 ? 'other' : 'others'}`
  }
  return {
    to: to.map(participant => participant.name).join(', '),
    cc: cc.map(participant => firstName(participant)).join(', '),
    summary,
  }
}

export default formatRecipients
