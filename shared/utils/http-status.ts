const OK = 200
/** The first status after the successes (2xx). */
const MULTIPLE_CHOICES = 300

/** Whether `status` is a success (2xx). */
function isSuccess(status: number): boolean {
  return status >= OK && status < MULTIPLE_CHOICES
}

/** The HTTP status codes Linelo checks, by name. */
const httpStatus = {
  ok: OK,
  created: 201,
  accepted: 202,
  noContent: 204,
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  lengthRequired: 411,
  payloadTooLarge: 413,
  unsupportedMediaType: 415,
  tooManyRequests: 429,
  internalServerError: 500,
  badGateway: 502,
  serviceUnavailable: 503,
  gatewayTimeout: 504,
  isSuccess,
} as const

export default httpStatus
