import defineMailAction from '../../utils/define-mail-action'
import outgoing from '../../mail/outgoing'
import ranking from '../../utils/ranking'

/** Forwards a message from one of the signed-in user's mailboxes, then marks the thread as read and resolves it in the index. */
export default defineMailAction(
  outgoing.validateForward,
  ranking.recording(outgoing.forward, ({ accountId, markAsRead }) => ({
    accountId,
    messageIds: markAsRead,
    resolved: true,
  })),
)
