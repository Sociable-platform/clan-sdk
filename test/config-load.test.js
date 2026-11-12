import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadChatConfig } from '../src/config/load.js';
import { ConfigLoadError, ConfigError, normalizeChatConfig } from 'clan-sdk';
import { recordingFetch, jsonResponse } from './helpers/recording-fetch.js';

const url = 'https://config.example.test/caller-chosen.json';

test('real loader request contract: GET, JSON accept, no auth/cookies, fresh cache', async (t) => {
  const calls = recordingFetch(t, jsonResponse({ schemaVersion: 1 }));
  assert.deepEqual(await loadChatConfig(url), normalizeChatConfig({ schemaVersion: 1 }));
  assert.deepEqual(calls, [{ url, method: 'GET', headers: { Accept: 'application/json' }, credentials: 'omit', redirect: 'error', cache: 'no-store' }]);
});

test('relative config URL resolves against supplied document base', async (t) => {
  const calls = recordingFetch(t, jsonResponse({ schemaVersion: 1 }));
  await loadChatConfig('../config.json?version=2', { baseUrl: 'https://game.example.test/play/index.html' });
  assert.equal(calls[0].url, 'https://game.example.test/config.json?version=2');
});

test('bad URLs/signals reject before HTTP', async (t) => {
  const calls = recordingFetch(t);
  for (const value of [undefined, null, '', '/relative-without-base', 'file:///config', 'ftp://config.test', 'https://user:secret@config.test', `${url}#fragment`]) {
    await assert.rejects(loadChatConfig(value), TypeError);
  }
  for (const signal of [null, false, {}, 'signal']) await assert.rejects(loadChatConfig(url, { signal }), TypeError);
  assert.equal(calls.length, 0);
});

for (const status of [401, 404, 503]) {
  test(`HTTP ${status}: clear status error without retry or an assumed envelope`, async (t) => {
    const calls = recordingFetch(t, new Response('not JSON', { status }));
    await assert.rejects(loadChatConfig(url), error => {
      assert.ok(error instanceof ConfigLoadError);
      assert.equal(error.status, status);
      assert.equal(error.code, 'config_http_error');
      assert.equal(error.message, `Configuration request failed with HTTP ${status}.`);
      return true;
    });
    assert.equal(calls.length, 1);
  });
}

test('network failure propagates with no automatic retry', async (t) => {
  const error = new TypeError('Network unavailable');
  const calls = recordingFetch(t, error);
  await assert.rejects(loadChatConfig(url), failure => failure === error);
  assert.equal(calls.length, 1);
});

for (const body of ['', '{malformed', '<html>Not JSON</html>']) {
  test(`invalid/empty JSON is a configuration load error: ${JSON.stringify(body)}`, async (t) => {
    recordingFetch(t, new Response(body, { status: 200 }));
    await assert.rejects(loadChatConfig(url), error => {
      assert.ok(error instanceof ConfigLoadError);
      assert.equal(error.status, 200);
      assert.equal(error.code, 'config_invalid_json');
      assert.ok(error.cause instanceof SyntaxError);
      return true;
    });
  });
}

test('invalid remote config preserves central ConfigError field path', async (t) => {
  recordingFetch(t, jsonResponse({ schemaVersion: 1, theme: { primaryColor: 'red' } }));
  await assert.rejects(loadChatConfig(url), error => error instanceof ConfigError && error.path === 'theme.primaryColor');
});

test('no provisional wrapper is assumed around the chat config object', async (t) => {
  recordingFetch(t, jsonResponse({ provisionalConfig: { schemaVersion: 1 } }));
  await assert.rejects(loadChatConfig(url), error => error instanceof ConfigError && error.path === 'schemaVersion');
});

test('already cancelled initial loading never fetches', async (t) => {
  const calls = recordingFetch(t);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(loadChatConfig(url, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls.length, 0);
});

test('abort rejects promptly even if fetch ignores its signal; late results are consumed safely', async (t) => {
  let complete;
  const started = Promise.withResolvers();
  const controller = new AbortController();
  const calls = recordingFetch(t, () => { started.resolve(); return new Promise(resolve => { complete = resolve; }); });
  const pending = loadChatConfig(url, { signal: controller.signal });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await started.promise;
  controller.abort();
  await rejected;
  assert.equal(calls[0].signal, controller.signal);
  complete(jsonResponse({ schemaVersion: 1 }));
});

test('abort during body reading rejects and detaches its signal listeners', async (t) => {
  const controller = new AbortController();
  const added = t.mock.method(controller.signal, 'addEventListener');
  const removed = t.mock.method(controller.signal, 'removeEventListener');
  const reading = Promise.withResolvers();
  const text = Promise.withResolvers();
  recordingFetch(t, { ok: true, status: 200, text: () => { reading.resolve(); return text.promise; } });
  const pending = loadChatConfig(url, { signal: controller.signal });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await reading.promise;
  controller.abort();
  await rejected;
  assert.equal(added.mock.callCount(), removed.mock.callCount());
  text.resolve('{"schemaVersion":1}');
});

test('successful loading removes the caller abort listeners', async (t) => {
  const controller = new AbortController();
  const added = t.mock.method(controller.signal, 'addEventListener');
  const removed = t.mock.method(controller.signal, 'removeEventListener');
  recordingFetch(t, jsonResponse({ schemaVersion: 1 }));
  await loadChatConfig(url, { signal: controller.signal });
  assert.equal(added.mock.callCount(), 2);
  assert.equal(removed.mock.callCount(), 2);
});
