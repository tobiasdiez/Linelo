import defineMailAction from '../../utils/define-mail-action'
import outgoing from '../../mail/outgoing'

/** Sends a reply from one of the signed-in user's mailboxes, then marks the thread as read. */
export default defineMailAction(outgoing.validateReply, outgoing.reply)
