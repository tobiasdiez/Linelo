/** The signed-in person, as the app knows them. Declared globally because the lint setup allows only default exports. */
declare namespace Session {
  interface User {
    name: string
    /** The address the user signed in with. */
    email: string
    /** The user's mail accounts. */
    accounts: Inbox.MailAccount[]
  }

  /** What the sign-in page explains: why the user is (back) there. */
  type SignInNotice = 'cancelled' | 'approval' | 'reconnect' | 'expired' | 'taken' | 'failed'

  /** Why the app sent the user to sign in: Linelo lost access to the mailbox, or the session ended. */
  type SignInReason = 'reconnect' | 'expired'
}
