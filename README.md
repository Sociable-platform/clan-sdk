# Clan SDK

Plain JavaScript ES-module SDK. Implemented: TEAM-103's Social HTTP client, S-02 chat configuration normalization, and the compatible chat portion of S-03 (a disconnected mount/update/destroy shell). Clan rendering, the full configurable UI and chat transport are later work.

## Run tests

Use Node.js 22 or newer. There are no dependencies, so no install step is required:

```sh
npm test
```

The script runs `node --test test/social-client.test.js test/chat-config.test.js test/widget-api.test.js`. HTTP tests replace `fetch` and restore it after each test; configuration tests exercise a pure synchronous normalizer. Tests never contact a backend. There is no build script yet: `src/index.js` is the ESM entrypoint. The root package exports it and is private pending packaging/release work.

Run the real-browser lifecycle tests separately:

```sh
npm run test:browser
```

Open `http://127.0.0.1:5174/`. The page automatically runs DOM/computed-style assertions and reports pass/fail results, including narrow iframe viewports. This command starts a local server; it does not itself execute a headless browser or return a CLI pass/fail result. Stop it with Ctrl+C; set `BROWSER_TEST_PORT` if that port is occupied. The server serves only source/browser-test assets and makes no Social/backend calls. No browser-testing dependency or installation is required.

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

The runtime must provide native `fetch`, `URL` and `URLSearchParams`. Importing the module and initializing a client require no DOM. Social operations have no production mock fallback, player bootstrap or chat transport; widget mounting is a separate explicit call.

## Chat shell lifecycle (partial S-03)

```js
const sdk = init({ socialUrl: 'http://localhost:8082', getPlayerToken });
const widget = sdk.mountChatWidget({
  container: document.querySelector('#chat-root'),
  config: { schemaVersion: 1 },
});

widget.updateConfig({
  schemaVersion: 1,
  layout: { position: 'top-left', width: 320 },
  theme: { primaryColor: '#aabbcc' },
});
widget.destroy();
```

`mountChatWidget` is additive; the five Social methods and `init({socialUrl,getPlayerToken})` remain compatible. It requires an actual HTML element, not a selector string. Config passes through `normalizeChatConfig` before any mount/update effects. It returns `{ updateConfig, destroy }`; update takes a complete replacement configuration (omitted optional values default again). Invalid updates leave the current DOM/styles unchanged.

Each mount owns a new host element and Shadow DOM inside the supplied container. The shell displays the Chats label using `textContent` and explicitly says `Chat is not connected.` It has no messages, Send action, token acquisition, HTTP, sockets, timers, subscriptions or asynchronous data work. Therefore there are no response callbacks to cancel in this step; post-destroy updates reject and cannot recreate UI. There is no fake connection/success state.

Only one SDK widget may be active per container, across SDK instances; a second mount throws until the first is destroyed. Separate containers keep independent state/config. `destroy()` is idempotent, removes only the owned host, releases the container and permits remounting. It preserves pre-existing host content. Appearance updates reuse nodes.

Floating shells use the configured corner, an 8px inset, z-index 1000, and configured pixel dimensions clamped to viewport size minus 16px. Host inline style priorities and Shadow DOM isolate ordinary game styles. Normal CSS fixed-position containing-block rules still apply: choose a container outside transformed/contained ancestors when viewport anchoring is required. No host-page theme/canvas styles are changed.

`mountClanPanel` is **not implemented**: neither the SDK checkout nor the inspected dashboard/backend repositories contain the authentic clan design export needed for its separate adapter. Chat JSON is never treated as clan config. Full S-03 completion depends on that artifact; see [compatibility review](conflict.md). No generic clan schema/stub was invented.

## Chat configuration (S-02)

```js
import { normalizeChatConfig, ConfigError } from './src/index.js';

const config = normalizeChatConfig({
  schemaVersion: 1,
  layout: { position: 'top-left', width: 320 },
  theme: { primaryColor: '#aabbcc' },
  // Omitted tabs default to the one enabled Chats tab.
});

try {
  normalizeChatConfig({ schemaVersion: 1, theme: { primaryColor: 'red' } });
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  console.log(error.path); // theme.primaryColor
  console.log(error.code); // invalid_config
  console.log(error.message); // Includes field path and explanation.
}
```

`normalizeChatConfig(input)` is a standalone, synchronous, side-effect-free export. It accepts a plain object (including a null-prototype object), not a JSON string or array. Parse serialized JSON separately first. It performs no networking/DOM work and does not change `init()` or add widget methods. It returns fresh, mutable objects/arrays without modifying or sharing nested objects with the input or other calls.

Only **omitted own properties** receive defaults. Explicit `undefined`, `null`, wrong types and other invalid values throw `ConfigError`; values are never coerced. Missing/unsupported `schemaVersion` is always an error. For supplied `layout` or `theme`, the object may be partial or empty and only its omitted properties receive defaults.

| Supported field | Default | Validation |
| --- | --- | --- |
| `schemaVersion` | None; required | Number `1` only |
| `layout.mode` | `floating` | Only `floating` |
| `layout.position` | `bottom-right` | `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| `layout.width` | `380` | Finite number greater than zero, pixels |
| `layout.height` | `520` | Finite number greater than zero, pixels |
| `theme.primaryColor` | `#8B65EE` | Six-digit `#RRGGBB`, case insensitive |
| `theme.backgroundColor` | `#171923` | Same color rule |
| `theme.textColor` | `#F4F4F9` | Same color rule |
| `theme.borderRadius` | `14` | Finite number greater than or equal to zero, pixels |
| `tabs` | Reference Chats tab below, only when omitted | Non-empty array; exactly one enabled `chats` tab |

Width, height and radius allow fractional pixel values; there are no additional upper bounds or viewport clamps in this validation step. The MVP accepts only six-digit hex colors: no shorthand, alpha, color names, `rgb()` or surrounding whitespace. Color case and valid label strings are preserved.

The default tab is:

```js
{ id: 'chats', label: 'Chats', icon: 'message-circle', enabled: true, order: 0 }
```

For an explicitly supplied `tabs` array, **every entry must supply** `id`, `label`, `icon`, `enabled`, and `order`; individual tab fields have no defaults:

- IDs are unique and restricted to `chats`, `invites`, `members`.
- Exactly one `chats` entry is required and its `enabled` must be `true`. Its icon must be `message-circle`.
- Every label/icon is a string containing non-whitespace text. Labels are preserved verbatim, not interpreted as HTML or code.
- Every `enabled` is boolean; every `order` is a non-negative integer. Input array order is preserved; this module does not sort or render tabs.
- `invites` and `members` are accepted only with `enabled: false`. Their non-empty icon strings are retained as inert metadata, with no rendered/icon capability implied. Enabling either produces `unsupported_capability` at `tabs[index].enabled`.
- `tabs: []` and an array without Chats are invalid; neither is replaced with defaults.

Example of retained disabled metadata:

```js
const config = normalizeChatConfig({
  schemaVersion: 1,
  tabs: [
    { id: 'chats', label: 'Chats', icon: 'message-circle', enabled: true, order: 0 },
    { id: 'members', label: 'Members', icon: 'users', enabled: false, order: 1 },
  ],
});
```

`ConfigError` has `name`, `message`, `path` (for example `tabs[0].id`; `$` for the root) and `code`. Codes are `invalid_config`, `unsupported_version`, `unsupported_capability`, and `unsupported_config_format`. The latter rejects the known clan design discriminator passed to the chat normalizer.

Unknown fields at root/layout/theme/tab levels are **ignored and dropped**, using an explicit mapping of the supported fields above. Arbitrary objects/actions are not copied, merged or executed. The recognized `kind: "clan-experience-design-proposal"` is explicitly rejected as a separate format. This function is not a generic config adapter: legacy `schema_version` is not a substitute for `schemaVersion`.

The defaults and capability restrictions are SDK MVP decisions based on the supplied chat reference. They do not change backend storage or establish full compatibility with a dashboard export. A complete authentic clan `kind: "clan-experience-design-proposal", version: 1` export is still absent from this repository; that separate adapter is deferred. No clan schema or clan normalizer is invented here.

## Contract status

[Compatibility review](conflict.md) records exact remote branches/commits, code evidence, Git merge checks and outstanding dependencies. [Local contract map](docs/sdk-contract-map.md) and [local integration gaps](docs/integration-gaps.md) hold detailed planning notes; `docs/` is currently ignored and these links resolve only in a workspace containing those local files, not the remote repository. The ignore policy was not changed.

The implementation has not been verified against a live Social service. The inspected backend currently implements only health/readiness routes; clan operations and token issuance are pending. Its shared error envelope agrees with the SDK. The JWT helper serializes the game claim as `gid`, distinct from database `game_id` and older brief wording. The SDK treats tokens as opaque strings and does not derive game/player identity from those claims. Collection wrappers, member identity/name keys and several success statuses remain unconfirmed. No current dashboard/WS schema is available, and the SDK MVP chat config is not a claimed shared storage contract.

All invented test response shapes are explicitly marked **provisional** in `test/fixtures/social/provisional.js`; they demonstrate JSON passthrough, not authoritative DTOs. Test-only error codes prefixed `provisional_` likewise do not establish backend codes. The documented `clan_full` code is preserved. Tests cannot verify browser CORS, JWT signature checks, database capacity or cross-game isolation.
