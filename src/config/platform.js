import { defaultExperienceConfig } from './default-experience.js';
import {unwrapConfig} from './input.js';
import {ConfigError} from './errors.js';
import { ConfigLoadError, abortable, abortError, checkAbort, assertAbortSignal } from './load.js';

// Page-memory cache shared across SDK instances, isolated by canonical base URL
// and game ID. Entries preserve backend JSON config and its opaque ETag.
const cache = new Map();
const requests = new Map();

export function configDiagnostic(code, {status, path} = {}) {
  // Never log URLs, exception messages/causes, headers, ETags or config values.
  const field = typeof path === 'string' ? path.split(/[.[]/, 1)[0] : undefined;
  const details = {code};
  if (Number.isInteger(status)) details.status = status;
  if (['config','kind','schemaVersion','theme','screens'].includes(field)) details.field = field;
  try { console.warn('[clan-sdk] Published configuration unavailable or unsupported; using SDK defaults.', details); } catch { /* Host loggers must not break loading. */ }
}

export function platformSettings(options) {
  const {gameId, platformUrl} = options ?? {};
  if (gameId === undefined && platformUrl === undefined) return undefined;
  if (typeof gameId !== 'string' || !gameId.trim() || gameId === '.' || gameId === '..') {
    throw new TypeError('gameId must be a non-empty game ID string.');
  }
  let base;
  try { base = new URL(platformUrl); } catch { throw new TypeError('platformUrl must be an absolute HTTP(S) URL.'); }
  if (typeof platformUrl !== 'string' || !['http:','https:'].includes(base.protocol)
    || base.username || base.password || base.search || base.hash) {
    throw new TypeError('platformUrl must use HTTP(S), without credentials, query or fragment.');
  }
  return {gameId, platformUrl:base.href.replace(/\/+$/, '')};
}

/** W6's public envelope is {version,config}. The config itself stays unchanged. */
export function createPlatformConfigLoader({gameId,platformUrl,timeoutMs = 5000}) {
  const url = `${platformUrl}/api/v1/public/games/${encodeURIComponent(gameId)}/widget-config`;
  const key = JSON.stringify([platformUrl,gameId]);
  return async function load({signal} = {}) {
    assertAbortSignal(signal);
    checkAbort(signal);
    const ticket = (requests.get(key) ?? 0) + 1;
    requests.set(key,ticket);
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason ?? abortError('Configuration loading cancelled.'));
    signal?.addEventListener('abort',cancel,{once:true});
    const timer = setTimeout(() => controller.abort(new DOMException('Configuration request timed out.','TimeoutError')),timeoutMs);
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const stored = cache.get(key);
        const headers = {Accept:'application/json'};
        if (attempt === 0 && stored?.etag) headers['If-None-Match'] = stored.etag;
        const response = await abortable(controller.signal, () => globalThis.fetch(url, {
          method:'GET', headers, credentials:'omit', redirect:'error', cache:'no-store', signal:controller.signal,
        }));
        checkAbort(controller.signal);
        // 304 is not response.ok and has no JSON body. Never try to parse it.
        if (response.status === 304) {
          const available = cache.get(key);
          if (available) return structuredClone(available.config);
          if (attempt === 0) continue; // Exactly one unconditional recovery attempt.
          throw new ConfigLoadError({code:'config_304_without_cache',status:304,message:'No cached configuration.'});
        }
        if (!response.ok) {
          response.body?.cancel().catch(() => {});
          throw new ConfigLoadError({code:'config_http_error',status:response.status,message:'Configuration HTTP failure.'});
        }
        let envelope;
        try { envelope = await abortable(controller.signal, () => response.json()); }
        catch (cause) {
          checkAbort(controller.signal);
          throw new ConfigLoadError({code:'config_invalid_json',status:response.status,message:'Invalid configuration JSON.',cause});
        }
        checkAbort(controller.signal);
        if (!envelope || !Number.isSafeInteger(envelope.version) || envelope.version < 1 || !Object.hasOwn(envelope,'config')) {
          throw new ConfigLoadError({code:'config_invalid_envelope',status:response.status,message:'Expected the W6 version/config envelope.'});
        }
        // Platform owns the widget payload. Do not apply an SDK config schema.
        const config = structuredClone(unwrapConfig(envelope));
        checkAbort(controller.signal);
        if (requests.get(key) === ticket) cache.set(key,{config,etag:response.headers.get('ETag')});
        return structuredClone(config);
      }
    } catch (error) {
      // Caller cancellation/destroy must not be converted into a fallback mount.
      if (signal?.aborted) { checkAbort(signal); }
      const code = controller.signal.reason?.name === 'TimeoutError' ? 'config_timeout'
        : error instanceof ConfigLoadError ? error.code
        : error instanceof ConfigError ? 'config_invalid_wrapper' : 'config_network_error';
      configDiagnostic(code,error ?? {});
      return defaultExperienceConfig();
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort',cancel);
    }
  };
}
