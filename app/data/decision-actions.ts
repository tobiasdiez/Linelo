/** The four terminal actions in the rail, in display order, with their shortcut keys. */
const decisionActions = [
  { kind: 'reply', label: 'Reply', key: 'r', primary: true },
  { kind: 'handled', label: 'Mark as handled', key: 'h', primary: false },
  { kind: 'delegate', label: 'Delegate', key: 'd', primary: false },
  { kind: 'task', label: 'Add to Todoist', key: 't', primary: false },
] as const

export default decisionActions
