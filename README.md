# Clan SDK

Plain JavaScript ES-module SDK. Implemented: TEAM-103's Social HTTP client, chat configuration normalization, mount/update/destroy lifecycle, production remote chat configuration loading, and Discover rendering/search/join through a temporary replaceable renderer. Discover requires an explicit response adapter until Social DTOs are published. Final dashboard/game visuals will use the same frontend-supplied shared components. Other clan screens and chat transport remain deferred.

## Run tests

Use Node.js 22 or newer. There are no dependencies, so no install step is required:

```sh
npm test
```

The script runs `node --test test/social-client.test.js test/chat-config.test.js test/widget-api.test.js test/chat-state.test.js test/config-load.test.js`. Node HTTP tests replace `fetch` and restore it after each test; configuration/state tests exercise pure synchronous functions. Node tests never contact a backend. Browser tests additionally reach the development-only mock config endpoint over real HTTP. There is no build script yet: `src/index.js` is the ESM entrypoint. The root package exports it and is private pending packaging/release work.

Run the real-browser lifecycle tests separately:

```sh
npm run test:browser
```

Open `http://127.0.0.1:5174/`. The page automatically runs DOM/computed-style and remote-load assertions and reports pass/fail results, including narrow iframe viewports. This command starts a local server; it does not itself execute a headless browser or return a CLI pass/fail result. Stop it with Ctrl+C; set `BROWSER_TEST_PORT` if that port is occupied. The server serves development assets and a provisional mock configuration endpoint; it makes no Social/team-backend calls. No browser-testing dependency or installation is required.

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

## Temporary chat view and lifecycle (chat S-03 / S-04)

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

Each mount owns a new host element and Shadow DOM inside the supplied container. The temporary view has a neutral Chat header, the configured Chats tab/icon, a scrollable empty message area, a labeled draft input and a Send button. It explicitly displays disconnected, empty and unavailable states. Send is disabled for every draft until real transport exists; whitespace-only text is not considered a sendable draft. Defensive form handling prevents navigation, preserves the draft and never appends a fabricated message.

The SDK controller owns draft state and supplies state/config and action callbacks through `src/ui/chat-renderer.js`. `src/ui/renderers/placeholder-chat.js` contains only temporary visual DOM/styles and event delegation. Its internal adapter input is **not** a proposed prop contract for the frontend components. Authentication, fetching and WebSocket logic stay outside the visual component. No UI framework was added. When the shared components arrive, inspect their actual framework, styles, dependencies and configuration needs, adapt them behind this boundary (including Shadow DOM styles where applicable), and **remove** the placeholder rather than retaining two visual implementations. Dashboard preview fixtures and live game data must stay separate while using those same visual components.

Direct mounting/rendering makes no token, HTTP, socket or timer calls. The explicit remote configuration API below owns its own HTTP requests outside the renderer. Destroy removes renderer listeners and SDK-owned DOM; post-destroy updates cannot recreate UI. Appearance updates reuse the input and preserve its draft, focus and selection; invalid updates leave the previous UI/state intact.

Only one SDK widget may be active per container, across SDK instances; a second mount throws until the first is destroyed. Separate containers keep independent state/config. `destroy()` is idempotent, removes only the owned host, releases the container and permits remounting. It preserves pre-existing host content. Appearance updates reuse nodes.

Floating shells use the configured corner, an 8px inset, z-index 1000, and configured pixel dimensions clamped to viewport size minus 16px. Host inline style priorities and Shadow DOM isolate ordinary game styles. Normal CSS fixed-position containing-block rules still apply: choose a container outside transformed/contained ancestors when viewport anchoring is required. No host-page theme/canvas styles are changed.

`mountClanPanel` is **not implemented**: neither the SDK checkout nor the inspected dashboard/backend repositories contain the authentic clan design export needed for its separate adapter. Chat JSON is never treated as clan config. Full S-03 completion depends on that artifact; see [compatibility review](conflict.md). No generic clan schema/stub was invented.

## Production remote configuration loading

```js
const sdk = init({ socialUrl: 'http://localhost:8082', getPlayerToken });
const controller = new AbortController();
const widget = await sdk.mountChatWidgetFromUrl({
  container: document.querySelector('#chat-root'),
  configUrl: 'https://config.example.test/caller-selected-chat.json',
  signal: controller.signal, // optional: cancels initial loading only
});

try {
  await widget.refreshConfig();
} catch (error) {
  // The existing widget/config/draft are retained on failure.
  console.error(error);
}

widget.updateConfig({ schemaVersion: 1, theme: { primaryColor: '#3758A8' } });
widget.destroy();
```

The URL in the example is a placeholder the host must replace. No backend route is hardcoded in production code. `configUrl` is a non-empty HTTP(S) URL or a relative URL resolved against the container document's base at initial mounting. Embedded URL credentials and fragments are rejected. A URL/query may be caller-selected; the SDK does not invent a game identifier, published version or response wrapper.

`mountChatWidgetFromUrl()` makes a real GET, checks HTTP status, parses the JSON body and validates it through `normalizeChatConfig()`, then calls the existing direct `mountChatWidget()`. The response must be a bare chat-v1 configuration object. An empty body or a `{ config: ... }` wrapper is not silently accepted. Initial failures reject without creating a widget. `init()` remains synchronous/network-free, and direct mounting remains unchanged.

The remote handle has `updateConfig(config)`, `refreshConfig()` and `destroy()`:

- `refreshConfig()` fetches the same URL again (`cache: no-store`) and applies it through the mounted widget's existing `updateConfig()`, preserving draft/focus. Its promise resolves after application; failures reject without changing the current config/UI/draft.
- Starting a newer refresh aborts/supersedes an older one. A successful local `updateConfig()` also supersedes a pending refresh. An invalid local update does neither. Aborted/superseded promises reject; callers that intentionally overlap requests should handle `AbortError`.
- Each handle has its own revision/controller. Stale responses cannot apply, even if a fetch/body implementation ignores abort. `destroy()` aborts pending refreshes, blocks late DOM work, releases the mount and remains idempotent. Calling refresh/update after destruction rejects/throws without fetching.
- The optional initial `signal` cancels loading promptly; aborting it after the widget has mounted does not control subsequent refreshes. Destroy the handle to end its mounted lifetime. Signal listeners are detached after each operation.

Configuration requests have `Accept: application/json`, `credentials: omit` and `redirect: error`. They never call `getPlayerToken()`, set Authorization or include game secrets. Cookie/authenticated config endpoints and redirects are not supported by this API; supply a directly readable final URL with suitable CORS. No retries, polling, WebSockets, automatic updates or mock fallback are added.

Error behavior:

| Failure | Result |
| --- | --- |
| HTTP failure | Exported `ConfigLoadError`, code `config_http_error`, actual `status`, useful status-based message; no assumed endpoint error envelope |
| Empty/malformed JSON success | `ConfigLoadError`, code `config_invalid_json`, HTTP `status`, parser `cause` |
| Invalid chat configuration | Existing `ConfigError`, including its precise field `path`/`code` |
| Fetch/body network error | Original error propagates |
| Cancellation/supersession/destruction | `AbortError` (or the caller's custom initial signal reason) |
| Invalid URL/container/signal | Clear argument error |

This is a production caller-URL loader, not an implementation of dashboard publishing/storage. The team's published/draft distinction, version envelope, authentication and cache/update contracts remain unconfirmed. The shared renderer and real chat transport remain separate dependencies.

## Development preview and manual checks

```sh
npm run preview
```

Open `http://127.0.0.1:5174/preview/`. This reuses the browser-test server; if `npm run test:browser` is already running, open that URL without starting a second server. The preview imports the actual SDK, calls `init()` / `mountChatWidgetFromUrl()` and uses the returned `refreshConfig()`. Chat messaging is still disconnected. It is a local development preview, not a distributable build or final demo milestone. Preview/mock files are outside the production package entrypoint.

Keep the preview server running while using this local URL; closing its terminal stops a foreground server. The development page mounts the actual SDK into a same-origin iframe so the floating widget cannot cover the preview controls in a narrow Codex pane. Floating positions are relative to that labeled widget viewport. This framing is preview-only and does not change SDK positioning or APIs.

1. Initial mount fetches the config URL shown on the page. Type an unsent draft and click **Refresh config**; it makes another HTTP request, changes the rotating development appearance preset and preserves the draft. The browser suite also verifies focus preservation during script-driven refreshes.
2. **Destroy / cancel loading** aborts initial loading or destroys the mounted handle. Change the URL, then **Mount widget from URL**. A new handle starts with an empty draft. The URL is fixed per handle; editing the field alone does not retarget existing refreshes.
3. Optionally expand **JSON editor (local override only)**, edit fields and apply a local override. Invalid values show a field-path error without changing the widget/draft. This editor does not save server data; the next Refresh restores the HTTP source.
4. Verify Send stays disabled and the message area stays empty. Config loading is real HTTP, but messaging has no transport or fake connection.
5. Open `/` on the same server for the real-browser assertion report, including load failures, races, cancellation, independent instances and the existing direct-mount/no-network checks. Stop the development server with Ctrl+C.

**Provisional development-only contract:** `GET /__dev__/chat-config` is implemented solely in `test/dev-config-endpoint.js` and wired by the local test server. It returns a bare chat-v1 object; it is not a confirmed backend route or shared dashboard publishing format. `?variant=rotate` (default) alternates two fixture appearances per request; `?variant=reference` / `?variant=alternate` selects a fixed fixture. `?failure=http`, `?failure=json`, or `?failure=config` simulates HTTP 503, malformed JSON, or unsupported configuration. There is no storage/publishing implementation or API key. Production `src/` has no mock data and never automatically selects this route.

Implemented appearance mapping:

| Normalized property | Current effect |
| --- | --- |
| `layout.position`, `width`, `height` | Floating host corner/size, bounded by the viewport |
| `theme.primaryColor` | Surface border, selected tab underline, input border, Send background and focus outlines |
| `theme.backgroundColor`, `textColor` | Surface/composer background and foreground text |
| `theme.borderRadius` | Outer widget surface corners (pixels) |
| Chats `label`, `icon` | Safe text label and explicit static `message-circle` SVG mapping; disabled tabs are not rendered |

Blocked specifically on shared frontend components: final visual integration and reuse of the actual dashboard components. Separately blocked: clan adapter/mount (authentic clan config), and real messaging (versioned transport contract). These are not replaced with invented props, schemas or WebSocket messages. No final visual compatibility is claimed.

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

Unknown fields at root/layout/theme/tab levels are **ignored and dropped**, using an explicit mapping of the supported fields above. Arbitrary objects/actions are not copied, merged or executed. Recognized `kind: "clan-experience-design-proposal"` and `kind: "clan-complete-ui"` are explicitly rejected as separate formats, including when their version equals 1. This function is not a generic config adapter: legacy `schema_version` is not a substitute for `schemaVersion`.

The defaults and capability restrictions are SDK MVP decisions based on the supplied chat reference. They do not change backend storage or establish full compatibility with a dashboard export. A complete authentic clan `kind: "clan-experience-design-proposal", version: 1` export is still absent from this repository; that separate adapter is deferred. No clan schema or clan normalizer is invented here.

## Complete-experience structural validation

```js
import { validateExperienceConfig } from './src/index.js';

const input = {
  kind: 'clan-complete-ui',
  schemaVersion: 1,
  theme: {},
  screens: { custom: { sections: [] } },
};
const validated = validateExperienceConfig(input);
console.assert(validated === input); // Original object; no defaults, clone or conversion.
```

This separate synchronous validator checks only:

- Root/theme/screens and each screen/section are non-null objects, not arrays.
- `kind` is exactly `clan-complete-ui`; the format is distinguished by kind, not version alone.
- `schemaVersion` is a finite positive number, without coercion. Version 1 is the initial reference version; acceptance of another positive number is only a structural numeric check, not a promise of renderer/version capability support.
- `screens` has at least one supplied screen; every supplied screen has a `sections` array (which may be empty).
- Each section has non-empty string `id` and `type` (whitespace-only is invalid). IDs must be unique within their own screen, by exact string equality; the same ID in different screens is allowed. IDs/types are never trimmed or rewritten.

No particular screens, section IDs or types are required. `section.required` is preserved as unchecked metadata and does not imply that any section must be present. Additional root, theme, screen and section properties are preserved untouched. The validator returns the original input, supports frozen input, and does not mutate it or silently convert it to chat config.

Failures use the existing `ConfigError` with `code: invalid_config` and a field `path`, for example `screens.create.sections[1].id` (`$` for an invalid root).

**Intentionally unchecked:** color values, typography, layout, screen names/capabilities, known section types, labels/content/actions, visibility, `required`, nested chat tabs, rules, permissions and emblems. Passing validation is not sanitization, safe-to-render approval, feature support or backend permission enforcement. No rendering or networking for this format is added; the existing direct/remote chat consumers reject its kind rather than discarding its fields into legacy chat defaults.

`test/fixtures/config/complete-experience-v1.json` preserves the attached complete UI example with only `schemaVersion` changed from 2 to 1. It is test input, not SDK defaults or runtime game data. Run `npm test` for the structural validation and existing regression suites.

## Contract status

[Compatibility review](conflict.md) records exact remote branches/commits, code evidence, Git merge checks and outstanding dependencies. [Local contract map](docs/sdk-contract-map.md) and [local integration gaps](docs/integration-gaps.md) hold detailed planning notes; `docs/` is currently ignored and these links resolve only in a workspace containing those local files, not the remote repository. The ignore policy was not changed.

The implementation has not been verified against a live Social service. The inspected backend currently implements only health/readiness routes; clan operations and token issuance are pending. Its shared error envelope agrees with the SDK. The JWT helper serializes the game claim as `gid`, distinct from database `game_id` and older brief wording. The SDK treats tokens as opaque strings and does not derive game/player identity from those claims. Collection wrappers, member identity/name keys and several success statuses remain unconfirmed. No current dashboard/WS schema is available, and the SDK MVP chat config is not a claimed shared storage contract.

All invented test response shapes are explicitly marked **provisional** in `test/fixtures/social/provisional.js`; they demonstrate JSON passthrough, not authoritative DTOs. Test-only error codes prefixed `provisional_` likewise do not establish backend codes. The documented `clan_full` code is preserved. Tests cannot verify browser CORS, JWT signature checks, database capacity or cross-game isolation.
# Discover clans (temporary renderer, functional controller)

The complete-experience format is separate from chat-v1. Discover consumes
`kind: "clan-complete-ui", schemaVersion: 1`, `theme`, and `screens.discover`.
The supplied Discover panel was inspected at the linked studio; only its player
content is implemented. No studio/editor, Create form, Clan Home, or chat is added.
The final dashboard/game shared components remain a frontend dependency; they
will replace `src/ui/experience-renderer.js`'s temporary implementation.

```js
const sdk = init({ socialUrl, getPlayerToken });
const container = document.getElementById('clan-root');
const widget = sdk.mountExperience({
  container,
  config: completeExperienceConfig,
  clanAdapter: mapConfirmedClanResponse,
});
container.addEventListener('clan-sdk:joined', ({ detail }) => {
  // detail.clanId is the selected ID; no join response DTO is assumed.
});
container.addEventListener('clan-sdk:navigate', ({ detail }) => {
  // { screen: "create" | "discover", previousScreen }
});
widget.updateConfig(replacementConfig);
widget.navigate('discover');
widget.destroy();
```

Mount immediately loads through `sdk.listClans()`. Search debounces 250 ms and
invalidates old results immediately. Join uses `sdk.joinClan(id)`, permits one
pending join per instance, preserves server messages and emits `clan-sdk:joined`
on HTTP success. It stays on Discover; no Clan Home is implied. Events bubble
through the owned host to the supplied container. Create changes internal state,
emits `clan-sdk:navigate` and displays only a missing-target handoff with Back.
No Create screen component, form, game URL change or reload is implemented.

**Backend dependency:** the inspected backend implements no clan list/join
routes or response DTOs. Consequently `clanAdapter` is currently required;
mount rejects without it, before fetching or adding DOM. It is a synchronous
function from successful backend JSON to an array of **internal view models**:
unique non-empty string `id` and `name`, optional `emblemText` (plain text only),
`memberCount` (non-negative integer), `maxMembers` (positive integer), and
`canJoin` (boolean). These are SDK rendering fields, **not claimed backend DTO
keys**. Supply only fields supported by your confirmed response. No automatic
wire mapping, capacity fallback, JWT decoding, image URL inference, or mock
fallback exists. An invalid mapping becomes a visible load error with Retry.
Full (`memberCount >= maxMembers`, when both exist) or explicitly unavailable
clans cannot be joined; unknown availability is not labeled Open. Server
authorization/capacity checks remain authoritative.

Discover rendering supports these supplied fields (sizes/radii are pixels):

| Field | Renderer default / behavior |
| --- | --- |
| `theme.accent`, `background`, `text` | `#E779AA`, `#171923`, `#F4F4F9`; six-digit hex |
| `screens.discover.background` | Optional six-digit hex override; falls back to `theme.background`, then `#171923` when omitted. Invalid explicit values reject mount/update. |
| `theme.radius`, `buttonRadius`, `inputRadius` | 16, 8, 8; finite non-negative numbers |
| `theme.font` | `Inter, Arial, sans-serif`; CSSOM font-family assignment, no font download |
| `screens.discover.name` | Discover clans; neutral Clan hub header, no invented game name |
| `width`, `padding`, `headingSize`, `bodySize` | 390, 20, 23, 12; finite numbers, width/font sizes at least 1px, padding non-negative |
| `align` | left; left/center/right for hero |
| `sections` array order | Preserved; only supplied visible sections render |
| `sections[].visible` | true when omitted; explicit false hides section |
| `sections[].label`, `text` | Plain text; hero heading/support, search label/placeholder, list heading/support |
| Section `type` | hero, search (one visible), clans, button; unknown visible types reject |
| Button `text` | Only `create` action (or omitted); label is displayed with a decorative arrow |

`required` metadata does not force sections into the JSON. Other fields/screens
are not rendered or permission-enforced. `validateExperienceConfig()` remains
structural and unchanged; rendering has a separate, stricter supported-field
check with `ConfigError` paths. Neither step mutates the input. Invalid updates
leave UI unchanged; appearance updates preserve search value/focus. The widget
uses Shadow DOM, respects container width, scrolls within small viewports and
preserves game-owned content. The shared mount registry prevents mounting two
SDK widgets into one container. Destroy removes listeners/timers/DOM; existing
Social operations have no cancellation argument, so pending results are ignored
after navigation/destroy rather than claiming to cancel server-side writes.
Leaving Discover also suppresses a late join event/result; a join already sent
may still have changed backend membership. Back reloads the list, not membership.

Run `npm run preview`, then open
[Discover demo](http://127.0.0.1:5174/preview/discover/). If 5174 is occupied,
PowerShell: `$env:BROWSER_TEST_PORT='5175'; npm run preview`, then use port 5175.
The demo uses the real SDK mount and Social HTTP client against the explicitly
provisional `/__dev__/social` mock service in `test/dev-discover-endpoint.js`.
Its `demoClans` response envelope, sample emblems/capacities/availability and
204 join success are **mock-only**, not confirmed contracts. Its mapping lives
in `preview/discover/mock-adapter.js`, never the production entrypoint.
Edit `preview/discover/config.json` and reload to change appearance/order/copy.
Search `missing` for empty, `error` for error/retry; click the rejection sample,
try a normal join, and Create/Back. Full clans have disabled buttons.

Verification for this step: see the dated Discover entry in `conflict.md` for
actual Node/browser results and exact remote snapshots. Browser tests extend
the existing harness; they use recording fake fetch and provisional fixtures.
The demo's HTTP mock is separately exercised manually. Neither establishes live
JWT/CORS, database capacity enforcement, or backend integration compatibility.

Files added for Discover: `src/config/discover.js`,
`src/experience/discover-controller.js`, `src/ui/experience-widget.js`,
`src/ui/experience-renderer.js`, `src/ui/renderers/discover.js`,
`src/ui/mount-registry.js`, `test/discover.test.js`,
`test/browser/discover-tests.js`, `test/dev-discover-endpoint.js`, and
`preview/discover/{index.html,preview.js,config.json,mock-adapter.js}`.
Updated: `src/index.js`, `src/ui/chat-widget.js` (shared mount registry only),
`test/widget-api.test.js`, `test/browser/{widget-tests.js,server.js}`,
`package.json`, this README, `conflict.md`, and the local-only contract/gap docs.
Actual results: **138 Node tests and 52 browser tests passed**, including the
existing 127 Node and 41 browser cases. `git diff --check` passed.
