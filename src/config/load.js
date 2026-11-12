import { normalizeChatConfig } from './chat.js';

export class ConfigLoadError extends Error {
  constructor({ status, code, message, cause }) {
    super(message, { cause });
    this.name = 'ConfigLoadError';
    this.status = status;
    this.code = code;
  }
}

export const abortError = message => new DOMException(message, 'AbortError');

export function checkAbort(signal) {
  if (signal?.aborted) throw signal.reason ?? abortError('Configuration loading was cancelled.');
}

export function assertAbortSignal(signal) {
  if (signal !== undefined && (!signal || typeof signal.aborted !== 'boolean'
    || typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) {
    throw new TypeError('signal must be an AbortSignal.');
  }
}

// Also settle promptly when a custom fetch/body reader ignores AbortSignal.
export function abortable(signal, operation) {
  checkAbort(signal);
  if (!signal) return Promise.resolve().then(operation);
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => { cleanup(); reject(signal.reason ?? abortError('Configuration loading was cancelled.')); };
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve().then(() => { checkAbort(signal); return operation(); }).then(
      value => { cleanup(); resolve(value); },
      error => { cleanup(); reject(error); },
    );
  });
}

/** Real HTTP only. The caller chooses the endpoint; no Social auth is reused. */
export async function loadChatConfig(configUrl, { signal, baseUrl } = {}) {
  assertAbortSignal(signal);
  checkAbort(signal);
  if (typeof configUrl !== 'string' || !configUrl.trim()) {
    throw new TypeError('configUrl must be an HTTP(S) URL or a browser-relative URL.');
  }
  let url;
  try { url = new URL(configUrl, baseUrl); } catch {
    throw new TypeError('configUrl must be an HTTP(S) URL or a browser-relative URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new TypeError('configUrl must use HTTP(S), without credentials or a fragment.');
  }
  if (typeof globalThis.fetch !== 'function') throw new TypeError('This SDK requires a runtime with fetch.');
  const response = await abortable(signal, () => globalThis.fetch(url.href, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    ...(signal === undefined ? {} : { signal }),
  }));
  checkAbort(signal);
  if (!response.ok) {
    // Do not depend on an unconfirmed config-endpoint error envelope.
    response.body?.cancel().catch(() => {});
    throw new ConfigLoadError({
      status: response.status, code: 'config_http_error',
      message: `Configuration request failed with HTTP ${response.status}.`,
    });
  }
  const text = await abortable(signal, () => response.text());
  checkAbort(signal);
  let input;
  try { input = JSON.parse(text); } catch (cause) {
    throw new ConfigLoadError({
      status: response.status, code: 'config_invalid_json',
      message: 'Configuration response must contain valid JSON.', cause,
    });
  }
  return normalizeChatConfig(input);
}
