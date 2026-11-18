import formatRecipients from '~/utils/format-recipients'
import isUncertain from '~/utils/is-uncertain'
import keepOnOutsideEscape from '~/utils/keep-on-outside-escape'

type ToastOptions = Parameters<ReturnType<typeof useToast>['add']>[0]
type ToastAction = NonNullable<ToastOptions['actions']>[number]
type SendAction = Extract<Inbox.TerminalAction, { kind: 'reply' | 'delegate' }>

/** Longer than other toasts: Undo is the only way back from an instant action. */
const UNDO_DURATION = 8000
/**
 * Stays until dismissed: the longest timer browsers keep (about 24 days). Not 0,
 * which Reka takes as "no timer" without cancelling the one already running when
 * this toast replaces another with the same id. The toaster shows at most two
 * toasts (`max: 2` in app.config), so two newer ones can still push it out.
 */
const UNTIL_DISMISSED = 2_147_483_647
const ERROR_ICON = 'i-lucide-circle-alert'
const WARNING_ICON = 'i-lucide-triangle-alert'

/*
 * What the inbox page says after an action: confirmations, failures and notices.
 * A toast with the id of one still shown is merged into it (Nuxt UI), so toasts
 * that share an id set every field that differs between them.
 */

function withUndo(undo: ToastAction, options: ToastOptions): ToastOptions {
  return {
    ...options,
    actions: [undo],
    duration: UNDO_DURATION,
    onEscapeKeyDown: keepOnOutsideEscape,
  }
}

/** The confirmation of a resolved item, with `undo` on the actions that can be undone. */
function confirmation(
  item: Inbox.QueueItem,
  action: Inbox.TerminalAction,
  undo: ToastAction,
): ToastOptions {
  const { subject } = item.thread
  switch (action.kind) {
    case 'reply': {
      const { summary } = formatRecipients(action)
      return {
        title: summary ? `Replied to ${summary}` : 'Reply sent',
        description: action.followUpTask
          ? `Also added to Todoist: ${action.followUpTask.title}`
          : subject,
      }
    }
    case 'handled': {
      return withUndo(undo, { title: 'Marked as handled', description: subject })
    }
    case 'delegate': {
      return { title: `Forwarded to ${action.to.name}`, description: subject }
    }
    case 'task': {
      return withUndo(undo, { title: 'Added to Todoist', description: action.task.title })
    }
    default: {
      throw new Error(`No confirmation for ${String(action satisfies never)}`)
    }
  }
}

/**
 * The id of the toast about a failed reply or forward of this item, so trying
 * again replaces it and a send of the same item that went through takes it away,
 * while a warning about another thread stays. `undefined` for other actions.
 */
function failureId(item: Inbox.QueueItem, kind: Inbox.TerminalAction['kind']): string | undefined {
  return kind === 'reply' || kind === 'delegate' ? `${kind}-failed-${item.key}` : undefined
}

/**
 * A toast about a failed send, every field set. When the mailbox may have sent it
 * after all (`uncertain`), a warning that names the thread and stays until
 * dismissed, also when Escape leaves the composer: sending again could send it
 * twice, and the user may have moved on by the time they read it.
 */
function failureToast(
  id: string | undefined,
  title: string,
  uncertain: { subject: string } | undefined,
): ToastOptions {
  return {
    // Without an id, the toaster makes one up
    ...(id === undefined ? {} : { id }),
    title,
    description: uncertain?.subject,
    color: uncertain ? 'warning' : 'error',
    icon: uncertain ? WARNING_ICON : ERROR_ICON,
    // The toaster's default for an error, also when it replaces a warning that stayed
    duration: uncertain ? UNTIL_DISMISSED : undefined,
    onEscapeKeyDown: uncertain ? keepOnOutsideEscape : undefined,
  }
}

function sendFailureTitle(action: SendAction, uncertain: boolean): string {
  const what = action.kind === 'reply' ? 'reply' : 'forward'
  if (uncertain) {
    return `Outlook didn't confirm the ${what}. Check Sent Items before sending again.`
  }
  if (action.kind === 'reply') {
    return "Couldn't send the reply. Your draft is still here."
  }
  return action.note.trim()
    ? "Couldn't forward this message. Your note is still here."
    : "Couldn't forward this message. Try again."
}

/** An action that failed; the item stays. One toast per item and send action. */
function failure(
  item: Inbox.QueueItem,
  action: Inbox.TerminalAction,
  error: unknown,
): ToastOptions {
  switch (action.kind) {
    case 'reply':
    case 'delegate': {
      const uncertain = isUncertain(error)
      return failureToast(
        failureId(item, action.kind),
        sendFailureTitle(action, uncertain),
        uncertain ? { subject: item.thread.subject } : undefined,
      )
    }
    case 'handled': {
      return failureToast(undefined, "Couldn't mark this as handled. Try again.", undefined)
    }
    case 'task': {
      return failureToast(undefined, "Couldn't add the task to Todoist. Try again.", undefined)
    }
    default: {
      throw new Error(`No failure notice for ${String(action satisfies never)}`)
    }
  }
}

const followUpFailure: ToastOptions = {
  title: 'Reply sent',
  description: "Couldn't add the task to Todoist.",
  color: 'error',
  icon: ERROR_ICON,
}

const undoFailure: ToastOptions = {
  title: "Couldn't mark this as unread again.",
  color: 'error',
  icon: ERROR_ICON,
}

// TODO: Create tasks once Todoist is connected
/** A fixed id, so pressing T again replaces the notice instead of stacking copies. */
const taskUnavailable: ToastOptions = {
  id: 'task-unavailable',
  title: "Adding to Todoist isn't available yet.",
}

const actionFeedback = {
  confirmation,
  failure,
  failureId,
  followUpFailure,
  undoFailure,
  taskUnavailable,
}

export default actionFeedback
