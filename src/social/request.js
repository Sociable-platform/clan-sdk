import { ApiError } from './errors.js';

/** Internal HTTP boundary shared by all five Social operations. */
export function createRequest(socialUrl, getPlayerToken) {
  return async function request(path, { method = 'GET', body } = {}) {
    const serializedBody = body === undefined ? undefined : JSON.stringify(body);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = await getPlayerToken();
      if (typeof token !== 'string' || !token || /\s/.test(token)) {
        throw new TypeError('getPlayerToken must return a non-empty token string without whitespace.');
      }
      if (typeof globalThis.fetch !== 'function') {
        throw new TypeError('This SDK requires a runtime with fetch.');
      }

      const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };
      if (serializedBody !== undefined) {
        headers['Content-Type'] = 'application/json';
      }
      const response = await globalThis.fetch(`${socialUrl}${path}`, {
        method,
        headers,
        ...(serializedBody === undefined ? {} : { body: serializedBody }),
      });

      // Consume the response body, including the first rejected attempt, before retrying.
      const text = await response.text();
      if (response.status === 401 && attempt === 0) {
        continue;
      }

      let data;
      let parseError;
      if (text !== '') {
        try {
          data = JSON.parse(text);
        } catch (error) {
          parseError = error;
        }
      }

      if (!response.ok) {
        const error = data?.error;
        throw new ApiError({
          status: response.status,
          code: typeof error?.code === 'string' ? error.code : 'sdk_http_error',
          message: typeof error?.message === 'string'
            ? error.message
            : `Social request failed with HTTP ${response.status}.`,
        });
      }
      if (parseError) {
        throw new ApiError({
          status: response.status,
          code: 'sdk_invalid_json',
          message: 'Social returned invalid JSON in a successful response.',
          cause: parseError,
        });
      }
      return data;
    }
  };
}
