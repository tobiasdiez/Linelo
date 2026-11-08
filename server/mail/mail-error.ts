/** A failed mail call, typed so the API can tell "sign in again" from "try again later". */
class MailError extends Error {
  readonly kind: Mail.ErrorKind

  constructor(kind: Mail.ErrorKind, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MailError'
    this.kind = kind
  }
}

export default MailError
