# Clan SDK

Plain JavaScript ESM Social client and widget lifecycle. The SDK and dashboard now render the **same `@clan/ui` package**, provided in `clan-frontend/packages/ui`. No dashboard app, React runtime, router or editor panels are imported. Frontend source is read-only; there is no second widget component/style copy in this SDK.

## Install and verify

Node 22 or newer; keep the supplied frontend checkout at `clan-frontend`:

```sh
npm ci
npm test
npm run test:browser
```

Open http://127.0.0.1:5174/ to execute the real-browser assertions. The script starts the server; it does not itself launch a browser or return a CLI test result. Set `BROWSER_TEST_PORT` if necessary. There is no build script. `src/index.js` is the ESM entrypoint. The root package is private; `@clan/ui` is a local file dependency linked to the canonical frontend source. A separately published/versioned shared package is still a release dependency. Do not distribute an SDK package that leaves that file dependency unresolved.

`npm test` uses Node's built-in runner and recording fake fetch. It never contacts a backend. Browser tests distinguish synthetic Social/Platform responses from the real HTTP request to the development-only config mock. Actual current results are in [shared renderer notes](docs/shared-renderer.md).

## Minimal game integration

Use a bundler that resolves the SDK's ESM dependencies; the local test server provides an import map for native-browser development.

```js
import {init} from './src/index.js'; // or your installed SDK package

const sdk = init({
  gameId: '797ed3c3-50ff-49be-ba96-111b493beb82',
  platformUrl: 'http://localhost:8081',
  socialUrl: 'http://localhost:8082',
  getPlayerToken: async () => obtainPlayerTokenFromGameServer(),
});

const container = document.querySelector('#social-widget');
const widget = sdk.mountExperience({container});
await widget.ready;

// Optional host notification. The SDK owns Join/Create/search/navigation.
container.addEventListener('clan-sdk:joined', event => {
  console.log('Joined clan', event.detail.clanId);
});

// Explicitly check for a new publication; no polling is installed.
await widget.refreshConfig();
// On game teardown:
widget.destroy();
```

`obtainPlayerTokenFromGameServer` is a host-supplied function, not an SDK method or a suggested backend URL. Keep the secret API key and player-token exchange on the game server. Return only the token string, without the `Bearer` prefix. No developer token is needed by W6. The SDK never decodes JWTs or implements registration. Opening the live Friends tab uses the confirmed `GET /players/me` bootstrap for Social identity; init and clan-only flows do not add that request.

`init()` is synchronous and requests neither config nor tokens. Both `gameId` and `platformUrl` are required together to enable Platform loading. `socialUrl` and `getPlayerToken` retain their existing validation. Service URLs are absolute HTTP(S), optionally with a proxy prefix; omit `/api/v1`. Trailing slashes are supported; URL credentials, queries and fragments are rejected.

## Published configuration → shared UI

Mounting without `config` starts **one** public request:

```
GET {platformUrl}/api/v1/public/games/{encodedGameId}/widget-config
200: { "version": 1, "config": { ...current shared config... } }
ETag: "v1"
```

This is the inspected W6 route, not a guessed dashboard/authenticated route. Config requests use `credentials:'omit'`, no Authorization, no API key and no Social token callback. The loader unwraps `config`. Per the user's existing policy, **published config payloads are not SDK-schema-validated**. JSON/W6 envelope checks remain; the shared renderer safely selects supported fields. An unrenderable payload uses the render error boundary. Direct caller updates have minimal type/appearance checks before replacing working UI.

The current document has `schemaVersion:1`, `game_id`, `theme.colors/fonts/frame/buttons/panel/textures/components`, `layout`, `friends`, `clan.screens`, `chat`, and `texts`. It has no prototype `kind` or root `screens`. See the frontend [schema](clan-frontend/docs/config-v1/config.v1.schema.json), [examples](clan-frontend/docs/config-v1/examples) and [SDK regression fixture](test/browser/fixtures/platform-widget-v1.json). The SDK passes the full document to `@clan/ui`; it no longer converts current JSON into old Discover sections.

The config is retained across internal screen/tab navigation. Navigation never refetches config or changes the game's URL. Each view reads the same theme and its own `clan.screens` settings. No config loading is duplicated in the game.

Cache entries retain the backend payload and exact ETag in page memory, keyed by canonical Platform URL + game ID. Subsequent explicit loads/refreshes send that ETag unchanged in `If-None-Match`. A 304 reuses cache without reading the body or checking `ok`; a cacheless 304 retries once unconditionally. Concurrent older results cannot overwrite newer cache entries or local updates.

Network failures, a five-second total timeout, 404/other HTTP failures, malformed JSON/envelopes or render failures use a fresh built-in **current-format** appearance. No player/clan/message sample is supplied. Failures do not break the host game. Previous cached config/ETag is not replaced by a loading failure; the displayed fallback still replaces appearance and preserves an active draft. Diagnostics log only safe SDK categories/status, not tokens, URLs, payloads or exception contents. Caller cancellation/destroy rejects with `AbortError` instead of mounting fallback.

## Direct config and lifecycle

Current widget JSON may be unwrapped or wrapped in one top-level `config` object:

```js
import {normalizeWidgetConfig} from './src/index.js';
const normalized = normalizeWidgetConfig(JSON.parse(editorText));
// Both mount and updateConfig also normalize automatically:
const widget = sdk.mountExperience({container, config: {config: currentConfig}});
widget.updateConfig({config: nextConfig});
```

The manual comparison editor uses this same normalization. The shared envelope
boundary is also used by the W6 loader. All inner fields are preserved; envelope
metadata is not merged into the widget config. `config:null`, arrays and other
non-object wrapper values throw `ConfigError` at `config`. Existing validation
paths remain relative to the inner document (for example `schemaVersion` or
`theme.colors.brand`). Failed direct updates preserve the rendered widget and
draft. W6 retains its existing public response, cache/fallback and backend-payload
validation policy; wrapper failures use fallback and a safe diagnostic.

Dashboard/test hosts can bypass config networking:

```js
const widget = sdk.mountExperience({container, config: currentConfig});
widget.updateConfig(nextConfig); // synchronous; invalid update throws ConfigError
widget.navigate('discover');    // discover/create/home/members; shared eligibility applies
widget.destroy();
```

Direct mount is synchronous and has no `ready` or `refreshConfig`; Platform mount returns `ready`, `refreshConfig`, `updateConfig`, `navigate`, `destroy`. `updateConfig` replaces the document, rather than merging it. Config is cloned, instances are independent, and invalid direct updates leave the current appearance/draft intact. Theme updates preserve input values, focus and selection. Shared components retain their own local form/search/message drafts; changing a conversation/tab follows the shared UI's own draft behavior.

Destroy is idempotent, removes only SDK-owned DOM/listeners/font references, cancels config work, invalidates pending Social completions/timers, and allows remount. The Social methods do not expose AbortSignal, so pending Social HTTP may finish, but its late result cannot update destroyed UI. Container reservation is shared across legacy/current mounts. The shared widget owns its Shadow DOM and constant stylesheet. A thin SDK stage preserves host-page content and protects the mount from ordinary host CSS; transformed ancestors still obey normal fixed-position rules.

Curated Google font families use the same `googleFontsHref` as dashboard preview. The SDK adds reference-counted stylesheet links to the owning document and removes its own links on update/destroy. Custom asset IDs can be mapped with `mountExperience({container, config, assets:{badges:{...},textures:{...}}})`; missing live clan badges are not inferred from those appearance choices. Platform mounts also accept `assets`.

## Supported shared UI and runtime data

| Config | Shared presentation behavior |
| --- | --- |
| `theme.colors` | Brand, panel background, surface, text and muted colors |
| `theme.fonts` | Curated heading/body families and corresponding font stylesheet |
| `theme.frame/buttons/panel` | Frame, corners, button styles/case, opacity and blur |
| `theme.textures/components` | Shared built-in textures, safe mapped custom assets and per-part overrides |
| `layout.position`, `startCollapsed` | **bottom-left/bottom-right** dock and launcher state. Current schema has no numeric width/height or top corners; the shared component owns responsive sizing |
| `friends/clan/chat.enabled`, `chat.clanChat/directMessages` | Supported tab visibility; fixed Friends → Clan → Chat order |
| `clan.screens.*.enabled` | Discover/Create/Home/Members eligibility and internal navigation |
| `clan.screens.home.showStats` | Shared Home details; SDK suppresses unsupported live level/XP data |
| `texts.terms/labels` | Shared label overrides and `{Clan}`/`{clan}`/`{Clans}`/`{clans}` substitution |
| Ordered `clan.badges.allowed` / `clan.roles` | Shared picker/role presentation order; runtime permission authority remains backend |
| Chat layout/limits | Shared display only. No chat delivery, profanity enforcement or slow-mode enforcement is claimed |

There is **no generic screen/section/tab order field** in the current schema. Old prototype section arrays/hero layouts are not a second design system. Unknown fields remain in config; the renderer only consumes its supported fields. Minimal direct checks are not a full copy of the frontend's proposed strict JSON Schema validator and do not enforce permissions.

Live runtime flow:

1. If clan is enabled, call `myClan()`. Only `404 not_in_clan` means no membership; other errors are visible with Retry.
2. No clan → Discover → `listClans({q})`. Search is debounced 250 ms; stale results cannot replace newer searches. Server errors, loading, empty and retry are shown. Capacity comes from each response's `memberCount/maxMembers`, never from config. No runtime emblem, tag or description is fabricated.
3. Join → `joinClan(id)` once while pending → `clan-sdk:joined` → re-read `myClan()` → real Home data. No optimistic fake membership.
4. Create uses the supplied shared form and **only `{name}`** with `createClan`. Badge/tag/description controls are disabled in live mode because the backend doesn't accept them. Duplicate writes are guarded. Server errors remain visible; success refreshes membership.
5. Members → `clanMembers(id)`; map `playerId/displayName/role` to shared rows. Current Social UUID is not available in these membership responses, so no guessed `(you)` marker. Header role comes from `myClan`.
6. Friends and incoming/outgoing requests use the confirmed Friends API described below. Chat messages/threads remain empty without transport; Send/Enter preserve unavailable drafts. Leave/kick/promote/demote remain unwired in this SDK and disabled. Config cannot grant backend permissions.

The bridge currently uses documented-in-source `.sk-*`/`data-key` hooks for async search/status, per-row runtime capacities and unavailable actions. This keeps all markup/styles in the canonical package, but those hooks are a frontend API dependency; see [integration gaps](docs/integration-gaps.md). No live service success or deployed-build SHA is implied by mock tests.

## Friends API and shared UI

Friends integration uses Social `origin/develop@bdfc3d3f5d7360f7ada55c1b9622a3787989c49d`, `openapi/social.yaml` and matching handlers/services. All operations below exist; successful low-level JSON is returned unchanged. The existing HTTP helper, token callback, one fresh-token 401 retry and `ApiError` behavior apply.

```js
const me = await sdk.getMyPlayer(); // GET /api/v1/players/me; backend EnsurePlayer
const {players} = await sdk.searchPlayers({q: 'Ali', limit: 20});
const {friends} = await sdk.listFriends();
const {incoming, outgoing} = await sdk.listFriendRequests();

// Independent examples; use IDs from the relevant current server result:
await sdk.sendFriendRequest({playerId: players[0].id});
await sdk.acceptFriendRequest(incoming[0].id);
await sdk.declineFriendRequest(incoming[0].id);
await sdk.cancelFriendRequest(outgoing[0].id);
await sdk.removeFriend(friends[0].id);
```

| Method | Confirmed request and success |
| --- | --- |
| `getMyPlayer()` | GET `/api/v1/players/me` → 200 `{id,gameId,externalId,displayName,createdAt}` |
| `searchPlayers({q,limit?})` | GET `/api/v1/players?q=...&limit=...` → 200 `{players:[{id,displayName,relation,requestId?}]}` |
| `listFriends()` | GET `/api/v1/friends` → 200 `{friends:[{id,displayName,since}]}` |
| `listFriendRequests()` | GET `/api/v1/friends/requests` → 200 `{incoming,outgoing}`, each entry `{id,player:{id,displayName},createdAt}` |
| `sendFriendRequest({playerId})` | POST `/api/v1/friends/requests`, JSON `{playerId}` → 201 request, **or 200 friend** if the other player already requested you |
| `acceptFriendRequest(requestId)` | POST `/api/v1/friends/requests/{id}/accept`, no body → 200 friend |
| `declineFriendRequest(requestId)` | POST `/api/v1/friends/requests/{id}/decline`, no body → 204 |
| `cancelFriendRequest(requestId)` | DELETE `/api/v1/friends/requests/{id}`, no body → 204 |
| `removeFriend(playerId)` | DELETE `/api/v1/friends/{id}`, no body → 204 |

**ID namespaces:** send/remove use the **Social player UUID**, from search, friend lists or member lists. `externalId` is the game's own identifier and is never substituted for that UUID. Accept/decline/cancel use the **request UUID**, not `entry.player.id`. The server infers caller/game from the token. `getMyPlayer` reuses the backend's idempotent EnsurePlayer path; no extra registration endpoint/key is introduced.

Search requires nonblank q (1–50 characters after server trimming), optional integer limit1–100, default100. The server excludes self/other games and returns relations `none`, `friend`, `request_sent`, `request_received`; pending relations include `requestId`. DTO adapters remain internal to the SDK and never fabricate online presence.

The UI loads only when `friends.enabled === true` and Friends opens. It uses shared `@clan/ui` rows/search/Accept and shared button styles. SDK bindings add Add/Decline/Cancel/Remove/Refresh controls to those existing rows, without copying a screen or changing dashboard props. Search is debounced250ms; stale searches/loads and results after navigation or destroy are ignored. Blank input restores the friend list without sending an invalid empty search. Both request directions are displayed. Loading, empty, failure/Retry, pending and duplicate-click guards are explicit. Successful mutations refresh friends, requests and an active search; there is no optimistic fake friendship. 404/409 conflicts refetch while keeping the server's action error visible, without retrying the mutation. Other errors retain status/code/message through ApiError, including self, duplicate, already-friends, unavailable player and sender/receiver permission errors.

The widget also exposes `await widget.refreshFriends()` (after `ready` for a Platform handle). It refreshes an enabled, open Friends view; otherwise it does no work. Reopening the tab also refreshes. There is no polling. Backend RabbitMQ/Realtime friend notifications now exist, but this SDK has no realtime transport, so none is invented or partially opened here. Chat and presence remain unavailable.

**Player-session changes:** keep token renewal bound to the same player. When your host switches accounts, first change the callback's current-player source and immediately call `sdk.resetPlayerSession()` in the same synchronous host operation (or destroy widgets and create a new SDK). Reset invalidates pending authenticated responses and token callbacks, destroys old UI state/drafts/controllers, and restarts each SDK-owned widget with the new callback. Widgets on another SDK instance are unaffected. No JWT is decoded and token rotation alone does not mean an account switch. To change games or service settings, create a new SDK with the new initialization options. A request already committed by Social cannot be undone; its old UI result is ignored.

```js
currentPlayer = nextPlayer; // your callback reads this host-owned source
sdk.resetPlayerSession();
```

Verification: **225 Node tests**, **70 real-browser mock tests**, and **8 live PASS groups** against local Social with two isolated dedicated test players (includes relationship cleanup). No FAIL/BLOCKED live operations in that run. This verifies the HTTP SDK against the running service, not its deployed SHA, browser CORS, Platform token exchange or websocket delivery. The Node-only runner used the existing local development signing key in memory and logged no tokens; dedicated player records remain, relationships were removed. See [Friends report](docs/friends-integration.md) for exact source revisions, limitations and changed files.

Run mock tests with `npm test` and `npm run test:browser`. Live tests are **opt-in**, never part of npm test: `node test/live/friends.js --local-dev-key` for the supplied local backend/key. Alternatively provide `FRIENDS_LIVE_SOCIAL_URL`, `FRIENDS_LIVE_DEDICATED=1`, `FRIENDS_LIVE_TOKEN_A/B` as environment variables for two dedicated players whose external IDs start with `sdk-friends-test-`; run without the flag. Tokens are never printed. Do not use real player accounts for this destructive relationship lifecycle test.

Host events bubble from the widget: `clan-sdk:navigate` (`screen`, `previousScreen`), `clan-sdk:tab` (`tab`), `clan-sdk:joined`/`created` (`clanId`). The SDK performs the confirmed actions itself.

## Social client API (unchanged)

```js
await sdk.listClans({q:'Dragons'}); // GET /api/v1/clans?q=Dragons
await sdk.createClan({name:'Dragons'}); // POST /api/v1/clans, JSON {name}
await sdk.joinClan('clan-id'); // POST /api/v1/clans/{encodedClanId}/join, bodyless
await sdk.myClan(); // GET /api/v1/players/me/clan
await sdk.clanMembers('clan-id'); // GET /api/v1/clans/{encodedClanId}/members
```

These are independent examples, not a required sequence. All five use the same request function and return successful parsed JSON unchanged. Empty success returns `undefined`. Arguments are type-checked; backend validates UUIDs/name rules. Each HTTP attempt gets a token and sends `Authorization: Bearer <token>`; JSON bodies set Content-Type. The first 401 obtains another token and retries the same method/body once. No retry for 404/409, network/parsing/token failures. Concurrent operations share in-flight acquisition and refresh; the host owns expiry-based caching. Callback failure/invalid whitespace-containing token prevents unauthenticated fetch.

`ApiError` retains HTTP status and the API's `{error:{code,message}}` strings, including empty strings. Invalid/missing envelopes use `sdk_http_error` and a status-based message; malformed successful JSON uses `sdk_invalid_json`. Network/body-read/callback errors propagate. `myClan()` still rejects on 404; interpretation happens only in the widget controller.

Confirmed DTOs: list `{clans:[{id,name,memberCount,maxMembers}]}`, create201/join200 clan object, myClan `{clan,role}`, members `{members:[{playerId,displayName,role,joinedAt}]}`. No secret key or player registration is part of the SDK.

## Legacy API compatibility

`normalizeChatConfig`, `validateExperienceConfig`, `ConfigError`, `mountChatWidget` and `mountChatWidgetFromUrl` remain exported/available with their previous argument/error/lifecycle contracts. They are compatibility wrappers, not the format used for published current widgets.

- `normalizeChatConfig`: old chat-only `schemaVersion:1` with centralized defaults: floating bottom-right, 380×520 px; #8B65EE/#171923/#F4F4F9; radius14 px; one enabled Chats tab. Four corners, positive finite dimensions, nonnegative radius, #RRGGBB only. Enabled invites/members/unknown tabs reject; disabled invites/members may be retained. Unknown keys are ignored; defaults are not shared/mutated.
- `validateExperienceConfig`: old `kind:'clan-complete-ui'`, positive numeric schemaVersion, theme/screens/section structure and per-screen unique IDs only; returns original unchanged. Does not imply render support or safe unchecked fields.
- Legacy `mountExperience` complete-UI input gets an explicit compatibility conversion to the shared widget. Old hero/section ordering/full prototype visuals are retired. The current schema is passed straight through.
- `mountChatWidget({container,config})` keeps old normalization and mount/update/destroy reservation. It now uses the shared Chat tab. With no confirmed conversation supplied by that API it shows **No conversations yet**, rather than inventing a clan to display a composer. Old numeric radius is approximated by a shared corner preset; the legacy outer sizing/position wrapper remains. The old tab icon is not part of the current shared tab design.
- `await mountChatWidgetFromUrl({container,configUrl,signal?})` remains the caller-URL legacy loader returning updateConfig/refreshConfig/destroy. Initial HTTP/JSON/config failure mounts nothing; refresh failure leaves UI unchanged. Cancellation and stale-response guards remain. It requests a bare legacy chat JSON with no Social auth. **W6 does not use this loader or `/__dev__/chat-config`.**

## Local verification pages

Run `npm run preview` (same server as browser tests), then:

- [Shared UI comparison](http://127.0.0.1:5174/test/browser/shared-preview.html): left is direct `@clan/ui.render`, right is **public `sdk.mountExperience`**. Both receive the same current JSON and explicitly fabricated sample dataset. Change theme/feature/label JSON and Apply; select sample screen states; Destroy/Remount. All preview fixtures/actions live outside `src`. It is not the actual dashboard route or the demo game.
- [Manual-token live Social preview](http://localhost:5174/preview/discover/): edit Social URL, paste raw player token, Mount. Real failures never fall back to fake data; Retry reads the latest input token. Join/Create change real membership. Disconnect clears the in-memory token. No token is persisted/logged. Backend CORS must allow the page origin.
- `?mode=mock` explicitly opts that page into a development-only Social route prefix with fabricated data. This mock supports membership/list/join; other operations report unsupported.
- [Legacy remote Chat API preview](http://127.0.0.1:5174/preview/): bare legacy config HTTP mock and refresh; kept only for compatibility testing.

The requested editor URL is reachable but redirects to login in the available browser session. Full authenticated-editor visual verification is unavailable. Source inspection, 272 frontend shared/schema tests, SDK parity assertions and the comparison page establish the checked subset; they do not claim live backend/transport/game integration. The demo game is explicitly out of scope.

## Player token callback and coordination

The SDK calls `getPlayerToken({forceRefresh:false})` for normal Social acquisition,
and `getPlayerToken({forceRefresh:true})` after the first HTTP401. Existing zero-argument
callbacks remain compatible. All Friends reads remain distinct HTTP requests.
Normal concurrent acquisition and forced refresh share per-SDK in-flight work.
Requests whose old401 arrives after that refresh finishes reuse its result;
each HTTP operation still has at most two attempts and retains method/body.
Token callback failures do not send unauthenticated requests. Session reset drops
pending acquisition references and rejects previous-session responses/callbacks.

Expiry caching belongs to the game. Harvest Village now keeps its token only in
browser memory, using the game backend's `expiresIn` (seconds) / `expiresAt`
(epoch milliseconds). On the next use within30seconds of expiry (or10% for short
TTLs), it refreshes; there is no background polling or token persistence. A forced
refresh bypasses that cache and supersedes older pending acquisition. Auth
transitions clear the cache at both boundaries and block acquisition in between.
See [token optimization report](docs/token-optimization.md) for game integration,
source selection and actual test/build results.
