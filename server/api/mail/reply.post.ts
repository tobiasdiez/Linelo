import defineMailAction from '../../utils/define-mail-action'
import outgoing from '../../mail/outgoing'
import ranking from '../../utils/ranking'

/** Sends a reply from one of the signed-in user's mailboxes, then marks the thread as read and resolves it in the index. */
export default defineMailAction(
  outgoing.validateReply,
  ranking.recording(outgoing.reply, ({ accountId, markAsRead }) => ({
    accountId,
    messageIds: markAsRead,
    resolved: true,
  })),
)
