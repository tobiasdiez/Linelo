import defineMailAction from '../../utils/define-mail-action'
import inbox from '../../mail/inbox'
import ranking from '../../utils/ranking'

/** One sync step for each of the signed-in user's mailboxes; with `start`, the starting batch. */
export default defineMailAction(inbox.validateSync, ranking.sync)
