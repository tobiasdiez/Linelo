import defineMailAction from '../../utils/define-mail-action'
import readState from '../../mail/read-state'

/** Marks messages read or unread in one of the signed-in user's mailboxes. */
export default defineMailAction(readState.validate, readState.apply)
