import defineMailAction from '../../utils/define-mail-action'
import ranking from '../../utils/ranking'
import readState from '../../mail/read-state'

/** Marks messages read or unread in one of the signed-in user's mailboxes: resolved in the index, or back with Undo. */
export default defineMailAction(
  readState.validate,
  ranking.recording(readState.apply, ({ accountId, messageIds, read }) => ({
    accountId,
    messageIds,
    resolved: read,
  })),
)
