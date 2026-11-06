/** HTTP failure, or a successful HTTP response containing invalid JSON. */
export class ApiError extends Error {
  constructor({ status, code, message, cause }) {
    super(message, { cause });
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}
