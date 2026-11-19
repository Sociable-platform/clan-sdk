/** HTTP failure, or a successful HTTP response containing invalid JSON. */
export class ApiError extends Error {
  constructor({ status, code, message, cause }) {
    super(message, { cause });
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * True when Social, or the game's own token endpoint, says this game is not served (an admin
 * suspended the game or its developer's account). Nothing the player does can fix it, so the widget
 * says so and turns its controls off instead of offering Retry.
 */
export function isSuspendedError(error) {
  return error?.code === 'game_suspended';
}
