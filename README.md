# Clan SDK

Plain JavaScript ES-module SDK. This first implementation covers TEAM-103's Social HTTP client. Ready-made clan/chat widgets, configuration rendering and chat transport are later work.

## Run tests

Use Node.js 22 or newer. There are no dependencies, so no install step is required:

```sh
npm test
```

The script runs `node --test test/social-client.test.js`. Tests replace `fetch` and restore it after each test; they never contact a backend. There is no build script yet: `src/index.js` is the ESM entrypoint. The root package exports it and is private pending packaging/release work.

## Initialize

```js
import { init, ApiError } from './src/index.js';

const sdk = init({
  socialUrl: 'http://localhost:8082',
  getPlayerToken: async () => {
    // Implement this in the game: ask its trusted server for a player token.
    // Return the token string, not a Response or { token } wrapper.
    // After a rejected token, this callback must obtain a fresh one.
    return obtainPlayerTokenFromGameServer();
  },
});
```

`obtainPlayerTokenFromGameServer` is a host-supplied example function, not a supplied SDK method or an invented backend route. Keep the secret game API key on the game server. The SDK does not decode JWTs or register players.

`socialUrl` must be an absolute HTTP(S) service URL, optionally with a proxy prefix (for example `https://example.test/social`). Do not include `/api/v1`; methods append their full paths. Trailing slashes are normalized; credentials, query strings and fragments are rejected. `init()` is synchronous, validates configuration, returns an independent client and performs no HTTP or token acquisition. There is no hidden `/players/me` request.

## Social methods

```js
const clans = await sdk.listClans();
const matchingClans = await sdk.listClans({ q: 'Dragons' });
const created = await sdk.createClan({ name: 'Dragons' });
const joined = await sdk.joinClan('clan-id');
const mine = await sdk.myClan();
const members = await sdk.clanMembers('clan-id');
```

These are independent usage examples, not a required sequence (a player cannot create and join separate clans). Return values are the backend's parsed JSON **unchanged**; no collection envelopes or response DTOs are assumed.

| Method | Request |
| --- | --- |
| `listClans({q}={})` | `GET /api/v1/clans`, with encoded optional `q` |
| `createClan({name})` | `POST /api/v1/clans`, JSON `{ name }` only |
| `joinClan(clanId)` | `POST /api/v1/clans/{encodedClanId}/join`, no body |
| `myClan()` | `GET /api/v1/players/me/clan` |
| `clanMembers(clanId)` | `GET /api/v1/clans/{encodedClanId}/members` |

The client checks argument types; clan name length/uniqueness remain server rules. Clan IDs must be non-empty strings other than `.` or `..`. Join's bodyless request is provisional pending the backend contract. No DTO is synthesized if join succeeds without a body.

## Authentication and errors

Every HTTP attempt awaits `getPlayerToken()` (a token string or promise for one), sends `Authorization: Bearer <token>` and requests JSON. JSON request bodies set `Content-Type: application/json`.

On the first 401, the SDK calls the callback again and repeats the same method/body once. A second 401 is exposed. Other HTTP errors, network failures, parsing failures and callback failures are not retried. There is no token cache, proactive renewal or shared refresh coordination: simultaneous requests can each call the callback. The host owns token acquisition/freshness. Empty or whitespace-containing token values are rejected before fetch.

For the documented envelope `{ "error": { "code": "...", "message": "..." } }`, errors preserve the server's code/message and include HTTP status:

```js
try {
  await sdk.joinClan('clan-id');
} catch (error) {
  if (error instanceof ApiError) {
    console.log(error.status, error.code, error.message);
  } else {
    // Token callback, network or local argument/runtime error.
    throw error;
  }
}
```

Response edge policies are SDK decisions, not newly confirmed backend contracts:

- An empty successful body resolves to `undefined`; valid JSON, including `null`, stays unchanged.
- Malformed/non-JSON successful bodies reject with `ApiError`, the actual HTTP status, code `sdk_invalid_json`, and the parser error as `cause`.
- Errors without a valid JSON error envelope use code `sdk_http_error` and message `Social request failed with HTTP <status>.` Valid string code/message values are preserved individually, including empty strings. Raw non-JSON server bodies are not echoed.
- Network/body-read errors and token callback errors propagate unchanged. Invalid local configuration/arguments or callback token values use `TypeError`.
- `myClan()`'s 404 remains an `ApiError`; the client does not convert it to `null`. A later widget adapter will interpret agreed no-clan semantics.

The runtime must provide native `fetch`, `URL` and `URLSearchParams`. Importing the module requires no DOM. The client has no production mock fallback, player bootstrap, UI or chat transport.

## Contract status

[Contract map](docs/sdk-contract-map.md) and [integration gaps](docs/integration-gaps.md) record the original inspection and unresolved backend details. The implementation has not been verified against a live Social service. Collection wrappers, member identity/name keys and several success statuses remain unconfirmed.

All invented test response shapes are explicitly marked **provisional** in `test/fixtures/social/provisional.js`; they demonstrate JSON passthrough, not authoritative DTOs. Test-only error codes prefixed `provisional_` likewise do not establish backend codes. The documented `clan_full` code is preserved. Tests cannot verify browser CORS, JWT signature checks, database capacity or cross-game isolation.
