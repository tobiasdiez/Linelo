/** The two decisions on a suggestion, in display order, with their keys and labels. */
const calendarDecisionActions = [
  {
    verb: 'accept',
    label: 'Accept',
    key: 'a',
    primary: true,
    /** Names the event, so a list of buttons says what each one accepts. */
    labelFor: (title: string) => `Accept ${title}`,
  },
  {
    verb: 'dismiss',
    label: 'Not for me',
    key: 'n',
    primary: false,
    labelFor: (title: string) => `Not for me: ${title}`,
  },
] as const satisfies readonly {
  verb: Calendar.DecisionVerb
  label: string
  key: string
  primary: boolean
  labelFor: (title: string) => string
}[]

export default calendarDecisionActions
