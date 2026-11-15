import assert from 'node:assert/strict';
import { test } from 'node:test';
import { init, ApiError } from 'clan-sdk';
import { recordingFetch, jsonResponse } from './helpers/recording-fetch.js';
import { socialContracts } from './fixtures/social/contracts.js';

// Tests run serially because each replaces global fetch. Node restores t.mock
// automatically after each test, including when assertions fail.
const socialUrl = 'https://social.example.test';
const config = { socialUrl, getPlayerToken: () => 'player-token' };
const expired = () => jsonResponse({ error: { code: 'provisional_expired', message: 'Expired' } }, 401);

test('init exports five methods and makes no token or HTTP request', (t) => {
  const calls = recordingFetch(t);
  const token = t.mock.fn(() => 'token');
  const sdk = init({ socialUrl, getPlayerToken: token });
  assert.deepEqual(Object.keys(sdk), ['listClans', 'createClan', 'joinClan', 'myClan', 'clanMembers']);
  assert.equal(token.mock.callCount(), 0);
  assert.equal(calls.length, 0);
});

const operations = [
  { name: 'listClans', call: sdk => sdk.listClans(), path: '/api/v1/clans', method: 'GET', result: socialContracts.list },
  { name: 'createClan', call: sdk => sdk.createClan({ name: 'Dragons' }), path: '/api/v1/clans', method: 'POST', body: '{"name":"Dragons"}', result: socialContracts.create, status: 201 },
  { name: 'joinClan', call: sdk => sdk.joinClan(socialContracts.join.id), path: `/api/v1/clans/${socialContracts.join.id}/join`, method: 'POST', result: socialContracts.join },
  { name: 'myClan', call: sdk => sdk.myClan(), path: '/api/v1/players/me/clan', method: 'GET', result: socialContracts.mine },
  { name: 'clanMembers', call: sdk => sdk.clanMembers(socialContracts.join.id), path: `/api/v1/clans/${socialContracts.join.id}/members`, method: 'GET', result: socialContracts.members },
];

for (const operation of operations) {
  test(`${operation.name}: correct request, Bearer auth and unchanged JSON`, async (t) => {
    const calls = recordingFetch(t, jsonResponse(operation.result, operation.status));
    const token = t.mock.fn(async () => 'player-token');
    const sdk = init({ socialUrl, getPlayerToken: token });
    assert.deepEqual(await operation.call(sdk), operation.result);
    assert.equal(token.mock.callCount(), 1);
    assert.deepEqual(calls, [{
      url: socialUrl + operation.path,
      method: operation.method,
      headers: {
        Accept: 'application/json', Authorization: 'Bearer player-token',
        ...(operation.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(operation.body === undefined ? {} : { body: operation.body }),
    }]);
  });
}

test('search query is encoded, including Unicode and query delimiters', async (t) => {
  const calls = recordingFetch(t, jsonResponse([]));
  await init(config).listClans({ q: 'Əjdaha &?#/+' });
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/api/v1/clans');
  assert.equal(url.searchParams.get('q'), 'Əjdaha &?#/+');
  assert.equal([...url.searchParams].length, 1);
  assert.equal(url.hash, '');
});

for (const method of ['joinClan', 'clanMembers']) {
  test(`${method}: clan IDs are encoded as a single path segment`, async (t) => {
    const calls = recordingFetch(t, jsonResponse(null));
    await init(config)[method]('clan/Ə ?#%');
    const suffix = method === 'joinClan' ? 'join' : 'members';
    assert.equal(calls[0].url, `${socialUrl}/api/v1/clans/clan%2F%C6%8F%20%3F%23%25/${suffix}`);
  });
}

for (const base of [socialUrl, `${socialUrl}/`, `${socialUrl}///`, `${socialUrl}/proxy/`]) {
  test(`base URL joins routes without dropping proxy prefix: ${base}`, async (t) => {
    const calls = recordingFetch(t, jsonResponse({}));
    await init({ ...config, socialUrl: base }).myClan();
    assert.equal(calls[0].url, `${base.replace(/\/+$/, '')}/api/v1/players/me/clan`);
  });
}

for (const operation of operations) {
  test(`${operation.name}: 401 retries the identical operation with a fresh token`, async (t) => {
    const rejected = expired();
    const calls = recordingFetch(t, rejected, jsonResponse(operation.result, operation.status));
    let tokenCalls = 0;
    const sdk = init({ socialUrl, getPlayerToken: async () => ++tokenCalls === 1 ? 'old-token' : 'new-token' });
    assert.deepEqual(await operation.call(sdk), operation.result);
    assert.equal(tokenCalls, 2);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].headers.Authorization, 'Bearer old-token');
    assert.equal(calls[1].headers.Authorization, 'Bearer new-token');
    assert.deepEqual(calls[1], {
      ...calls[0], headers: { ...calls[0].headers, Authorization: 'Bearer new-token' },
    });
    assert.equal(rejected.bodyUsed, true);
  });
}

test('second 401 is exposed with its own code/message; exactly two attempts', async (t) => {
  const calls = recordingFetch(t, expired(), jsonResponse({ error: { code: 'provisional_rejected', message: 'Still rejected' } }, 401));
  const token = t.mock.fn(() => 'token');
  await assert.rejects(init({ socialUrl, getPlayerToken: token }).myClan(), error => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 401);
    assert.equal(error.code, 'provisional_rejected');
    assert.equal(error.message, 'Still rejected');
    return true;
  });
  assert.equal(calls.length, 2);
  assert.equal(token.mock.callCount(), 2);
});

for (const status of [400, 403, 404, 409, 429, 500, 503]) {
  test(`HTTP ${status} preserves API errors and never retries`, async (t) => {
    // Only clan_full is a documented code; the other code is explicitly provisional.
    const code = status === 409 ? 'clan_full' : 'provisional_error';
    const message = 'Backend message <unchanged>';
    const calls = recordingFetch(t, jsonResponse({ error: { code, message } }, status));
    const token = t.mock.fn(() => 'token');
    await assert.rejects(init({ socialUrl, getPlayerToken: token }).myClan(), error => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, status);
      assert.equal(error.code, code);
      assert.equal(error.message, message);
      return true;
    });
    assert.equal(calls.length, 1);
    assert.equal(token.mock.callCount(), 1);
  });
}

test('network failure is preserved and never retries', async (t) => {
  const failure = new TypeError('Network unavailable');
  const calls = recordingFetch(t, failure);
  const token = t.mock.fn(() => 'token');
  await assert.rejects(init({ socialUrl, getPlayerToken: token }).listClans(), error => error === failure);
  assert.equal(calls.length, 1);
  assert.equal(token.mock.callCount(), 1);
});

for (const duringRetry of [false, true]) {
  test(`token callback failure is preserved ${duringRetry ? 'during refresh' : 'before fetch'}`, async (t) => {
    const failure = new Error('Game token acquisition failed');
    const calls = recordingFetch(t, ...(duringRetry ? [expired()] : []));
    let count = 0;
    const sdk = init({
      socialUrl,
      getPlayerToken: async () => {
        count += 1;
        if (duringRetry && count === 1) return 'old-token';
        throw failure;
      },
    });
    await assert.rejects(sdk.listClans(), error => error === failure);
    assert.equal(calls.length, duringRetry ? 1 : 0);
    assert.equal(count, duringRetry ? 2 : 1);
  });
}

test('invalid callback token values fail before HTTP without leaking the value', async (t) => {
  const calls = recordingFetch(t);
  for (const value of [undefined, null, 42, {}, '', ' ', 'token\r\nheader', 'Bearer token']) {
    await assert.rejects(init({ socialUrl, getPlayerToken: () => value }).listClans(), TypeError);
  }
  assert.equal(calls.length, 0);
});

test('each operation obtains a token; independent clients keep their configuration', async (t) => {
  const calls = recordingFetch(t, jsonResponse({}), jsonResponse({}), jsonResponse({}));
  let count = 0;
  const first = init({ socialUrl, getPlayerToken: () => `token-${++count}` });
  const second = init({ socialUrl: 'https://other.example.test', getPlayerToken: () => 'other-token' });
  await first.listClans();
  await second.myClan();
  await first.myClan();
  assert.deepEqual(calls.map(call => call.headers.Authorization), ['Bearer token-1', 'Bearer other-token', 'Bearer token-2']);
  assert.equal(new URL(calls[1].url).origin, 'https://other.example.test');
  assert.equal(new URL(calls[2].url).origin, socialUrl);
});

test('init rejects invalid configuration without token or HTTP work', (t) => {
  const calls = recordingFetch(t);
  const invalid = [
    undefined, null, [], 'config', {}, { ...config, getPlayerToken: 'token' },
    ...['', '/relative', 'not a URL', 'file:///tmp/social', 'ftp://example.test',
      'https://user:password@example.test', `${socialUrl}?q=x`, `${socialUrl}#part`]
      .map(value => ({ ...config, socialUrl: value })),
  ];
  for (const options of invalid) assert.throws(() => init(options), TypeError);
  assert.equal(calls.length, 0);
});

test('argument errors do not send requests; dot path IDs are rejected', (t) => {
  const calls = recordingFetch(t);
  const sdk = init(config);
  assert.throws(() => sdk.listClans({ q: 1 }), TypeError);
  assert.throws(() => sdk.createClan(), TypeError);
  for (const id of ['', ' ', null, undefined, 42, '.', '..']) {
    assert.throws(() => sdk.joinClan(id), TypeError);
    assert.throws(() => sdk.clanMembers(id), TypeError);
  }
  assert.equal(calls.length, 0);
});

for (const value of [null, false, 0, 'unchanged', [], { arbitrary: { nested: [1, 2] } }]) {
  test(`successful JSON passes through without assuming an object DTO: ${JSON.stringify(value)}`, async (t) => {
    recordingFetch(t, jsonResponse(value));
    assert.deepEqual(await init(config).listClans(), value);
  });
}

for (const status of [200, 204, 205]) {
  test(`empty successful HTTP ${status} returns undefined`, async (t) => {
    const calls = recordingFetch(t, new Response(null, { status }));
    assert.equal(await init(config).joinClan('clan-1'), undefined);
    assert.equal(calls.length, 1);
  });
}

for (const body of ['not JSON', '{broken', '   ']) {
  test(`invalid successful JSON produces an SDK parsing error: ${JSON.stringify(body)}`, async (t) => {
    const calls = recordingFetch(t, new Response(body, { status: 200 }));
    await assert.rejects(init(config).myClan(), error => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 200);
      assert.equal(error.code, 'sdk_invalid_json');
      assert.ok(error.cause instanceof SyntaxError);
      return true;
    });
    assert.equal(calls.length, 1);
  });
}

for (const body of ['', '<html>Unavailable</html>', '{broken', 'null', '{}']) {
  test(`non-contract HTTP error has a status-based SDK fallback: ${JSON.stringify(body)}`, async (t) => {
    const calls = recordingFetch(t, new Response(body, { status: 502 }));
    await assert.rejects(init(config).myClan(), error => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 502);
      assert.equal(error.code, 'sdk_http_error');
      assert.equal(error.message, 'Social request failed with HTTP 502.');
      return true;
    });
    assert.equal(calls.length, 1);
  });
}

test('partial API error preserves available strings; SDK fills only missing fields', async (t) => {
  recordingFetch(t,
    jsonResponse({ error: { code: 'provisional_code' } }, 400),
    jsonResponse({ error: { message: 'Original message' } }, 400),
    jsonResponse({ error: { code: '', message: '' } }, 400),
  );
  const sdk = init(config);
  await assert.rejects(sdk.listClans(), { code: 'provisional_code', message: 'Social request failed with HTTP 400.' });
  await assert.rejects(sdk.listClans(), { code: 'sdk_http_error', message: 'Original message' });
  await assert.rejects(sdk.listClans(), { code: '', message: '' });
});

test('a non-JSON first 401 still retries once', async (t) => {
  const calls = recordingFetch(t, new Response('Unauthorized', { status: 401 }), jsonResponse({}));
  await init(config).listClans();
  assert.equal(calls.length, 2);
});

test('a non-401 error after refreshing is exposed without another attempt', async (t) => {
  const calls = recordingFetch(t, expired(), jsonResponse({ error: { code: 'clan_full', message: 'Full' } }, 409));
  await assert.rejects(init(config).joinClan('clan-1'), { status: 409, code: 'clan_full', message: 'Full' });
  assert.equal(calls.length, 2);
});
