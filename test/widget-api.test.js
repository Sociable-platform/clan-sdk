import assert from 'node:assert/strict';
import { test } from 'node:test';
import { init } from 'clan-sdk';

test('widget API is additive; init/import needs no DOM, token or network', (t) => {
  const token = t.mock.fn(() => { throw new Error('Unexpected token acquisition'); });
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected HTTP'); });
  const sdk = init({ socialUrl: 'http://localhost:8082', getPlayerToken: token });
  assert.equal(typeof sdk.mountChatWidget, 'function');
  for (const method of ['listClans', 'createClan', 'joinClan', 'myClan', 'clanMembers']) {
    assert.equal(typeof sdk[method], 'function');
  }
  // No unsupported clan adapter/schema is invented just to expose a mount stub.
  assert.equal(sdk.mountClanPanel, undefined);
  assert.equal(token.mock.callCount(), 0);
  assert.equal(fetch.mock.callCount(), 0);
});

test('invalid containers fail clearly without DOM/network side effects', (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected HTTP'); });
  const sdk = init({ socialUrl: 'http://localhost:8082', getPlayerToken: () => 'token' });
  for (const container of [undefined, null, {}, [], 'selector', 42]) {
    assert.throws(() => sdk.mountChatWidget({ container, config: { schemaVersion: 1 } }), TypeError);
  }
  assert.equal(fetch.mock.callCount(), 0);
});
