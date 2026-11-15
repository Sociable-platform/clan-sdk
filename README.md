# Clan SDK

Plain JavaScript ESM Social client and widget lifecycle. The SDK and dashboard render the **same `@clan/ui` package**, installed from the Clan GitLab npm registry. No dashboard app, React runtime, router, editor panels or source checkout is required. The SDK does not maintain a second widget component/style copy.

## Install and verify

Node 22 or newer. The `.npmrc` next to `package.json` contains exactly:

```ini
@clan:registry=https://gitlab.com/api/v4/groups/146782114/-/packages/npm/
//gitlab.com/api/v4/groups/146782114/-/packages/npm/:_authToken=${GITLAB_NPM_TOKEN}
```

Keep that placeholder literal. Set `GITLAB_NPM_TOKEN` in the environment of the
terminal running npm. Use a **read-only group deploy token** with
`read_package_registry` permission and access to the package. No publish/write
permission is needed. This installation credential is separate from the game's
secret API key and the player's runtime token; never put it in browser code,
configuration JSON, a `VITE_` variable or a committed file.

Windows PowerShell (masked local prompt, token used only by this shell):

```powershell
$registrySecret = Read-Host 'GitLab read-only deploy token' -AsSecureString
$env:GITLAB_NPM_TOKEN = [System.Net.NetworkCredential]::new('', $registrySecret).Password
npm ci
npm test
# When finished with npm in this shell:
Remove-Item Env:\GITLAB_NPM_TOKEN
Remove-Variable registrySecret
```

Other shells can export an existing secret environment variable before running:

```sh
npm ci
npm run build
npm test
npm run test:bundle
```

`npm ci` installs the exact version in `package-lock.json`; it does not select a
new release just because `^0.1.30` allows one. To adopt a newer compatible release:

```sh
npm update @clan/ui
npm test
npm run test:browser
```

Include the resulting changed `package-lock.json` with every dependency update.
Do not substitute `file:` links or copied repositories. The lockfile currently
resolves registry release **0.1.30**, which is bundled into both browser formats.
See [migration results](REGISTRY-MIGRATION.md) for clean-install verification.

`npm run build` is the canonical build command. It uses esbuild and produces
`dist/clan-sdk.js` (classic script/IIFE) and `dist/clan-sdk.esm.js` (ES module).
Each contains the published UI renderer and its Shadow DOM CSS. Both have a
version banner read from `package.json`; the same version is exposed as
`ClanSDK.version` or the ESM `version` export. All existing public exports remain
available. Each output must be **under 60,000 bytes gzip**; the build prints both
sizes and fails if either reaches that limit. No bundler, import map, React,
separate UI stylesheet, or source checkout is needed by the consuming game.
Standalone builds use the renderer's system font fallbacks and never fetch
Google Fonts CSS. A game can supply fonts itself if it wants the curated faces.

`npm run test:bundle` requires a completed build. It launches headless Chromium
(or installed Chrome/Edge), starts the plain Node HTTP server on a temporary
port, and checks both built files on isolated HTML pages without import maps.
It checks API/version parity, a visible styled panel, token/service URL handling,
and rejects any extra SDK code or stylesheet requests. It then runs the existing
browser regression suite against the built ESM output. These are **bundle-loading
and regression tests with mocked Platform/Social/Realtime services**, not live
backend verification. Screenshots are written to `test/browser/artifacts/`.
If no browser is installed, run `npx playwright install chromium`; optionally set
`BROWSER_CHANNEL=chrome` or `msedge` to select an installed browser.

`npm run test:browser` still serves the original source-mode tests at
http://127.0.0.1:5174/. It starts a server without launching a browser; open the
page to execute the assertions. Set `BROWSER_TEST_PORT` if necessary. Its import
map serves the installed UI package for development/comparison only. After a
build, the standalone pages are available at `/test/browser/bundle-iife.html`
and `/test/browser/bundle-esm.html` on the same plain HTTP server. No Vite server
is used. `src/index.js` remains the source/package entry point.

CI uses the committed `.gitlab-ci.yml` to run `npm ci`/`npm test`, then build and
publish the asset-server image. Configure `GITLAB_NPM_TOKEN` as a **masked secret
CI/CD variable**, using the read-only group deploy token above; protect it where
appropriate for branch policy. It must be available to any publishing job you
start. The Docker build receives it only through a BuildKit secret. Do not echo
it or enable shell tracing around credentials.

`npm test` uses Node's built-in runner and recording fake fetch. It never contacts a backend. Browser tests distinguish synthetic Social/Platform responses from the real HTTP request to the development-only config mock. Actual current results are in [shared renderer notes](docs/shared-renderer.md).

## Docker asset server

The multi-stage Dockerfile builds from source with Node 22 (`npm ci` followed by
the canonical `npm run build`), then copies only the two generated bundles and
nginx configuration into `nginxinc/nginx-unprivileged:1.28-alpine`. The server runs
as the image's unprivileged user on port **8080**, matching Studio's service port.
The Node build runs on the builder's native CPU; the same JavaScript can be
packaged in either runtime architecture without QEMU. `.dockerignore` allows only
build inputs, excluding local `node_modules`, `dist`, `.git` and private env files.
No local bundle directory is required.

With `GITLAB_NPM_TOKEN` already set in your shell as described above:

```sh
docker build --progress=plain --secret id=gitlab_npm_token,env=GITLAB_NPM_TOKEN -t clan-sdk:ticket2 .
docker run --rm -d --name clan-sdk-ticket2-check -p 127.0.0.1:18080:8080 clan-sdk:ticket2
```

Or use Compose, which builds the `clan-sdk` image and serves it on
`127.0.0.1:18080`. Compose reads `GITLAB_NPM_TOKEN` from your shell or ignored
root `.env` and passes it only as a build secret:

```sh
docker compose build --no-cache sdk
docker compose up -d --no-deps --force-recreate sdk
node scripts/check-image.mjs http://127.0.0.1:18080
```

The credential is a [BuildKit secret](https://docs.docker.com/build/building/secrets/),
never a build argument or Dockerfile `ENV`. It is available only during `npm ci`.
The committed `.npmrc` keeps its literal `${GITLAB_NPM_TOKEN}` placeholder. The
runtime has no Node/npm, credentials or SDK source checkout.

Repeat the actual HTTP header checks (use `curl.exe` in Windows PowerShell):

```sh
VERSION=$(node -p "require('./package.json').version")
curl -I http://127.0.0.1:18080/v1/clan-sdk.js
curl -I "http://127.0.0.1:18080/$VERSION/clan-sdk.js"
curl -I http://127.0.0.1:18080/v1/clan-sdk.esm.js
curl -I "http://127.0.0.1:18080/$VERSION/clan-sdk.esm.js"
node scripts/check-image.mjs http://127.0.0.1:18080
docker stop clan-sdk-ticket2-check
```

In PowerShell, set the version with `$sdkVersion = node -p "require('./package.json').version"`
and use `$sdkVersion` in the exact-version URLs. `check-image.mjs` checks both HEAD
and GET headers, compares downloaded alias/version bytes for both files, checks
the package-version banners, and verifies missing/private paths return 404.
These checks use the actual nginx image; they do not contact Clan backends.

| Paths (current release) | Successful response headers |
| --- | --- |
| `/0.1.1/clan-sdk.js`, `/0.1.1/clan-sdk.esm.js` | `Content-Type: application/javascript`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=31536000, immutable` |
| `/v1/clan-sdk.js`, `/v1/clan-sdk.esm.js` | `Content-Type: application/javascript`, `Access-Control-Allow-Origin: *`, `Cache-Control: no-cache` |

The exact version is read from `package.json` at build time. `/v1/` is the agreed
moving alias even for version `0.1.0`; each alias/version pair has identical bytes
inside one image. **Changed bundle bytes require a new exact release version.**
Do not rebuild different bytes under a previously released immutable path.

**Known gap:** the version in `package.json` is not raised on each release yet, so the
`/0.1.0/` path currently changes with every deploy while browsers may keep it for a
year. Until releases are versioned, games use `/v1/` only and the pinned path is not
documented to developers.

The `images` CI job follows the team's Docker 27/DinD + buildx TLS-context setup:
automatic on `develop`/`main`, manual on merge request pipelines. It publishes one
multi-platform image for `linux/amd64,linux/arm64` with the full commit SHA tag:
`$CI_REGISTRY_IMAGE/sdk:$CI_COMMIT_SHA`, resolving in this project to
`<registry>/clan-platform/clan-sdk/sdk:<sha>`. Login uses `CI_REGISTRY_USER`,
`CI_REGISTRY_PASSWORD` and `CI_REGISTRY`. It requires a Docker runner configured
for privileged DinD with the team's shared `/certs/client` TLS setup. The job
prints `docker buildx imagetools inspect` after pushing; publication and the
registry's two platform manifests must be checked in GitLab CI.

The `test` job runs `npm test` and then `npm run build`, which prints the gzip size of
each bundle (`dist/clan-sdk.js: ... bytes gzip (... KB; target <60 KB)`) and fails the
job when a bundle reaches 60 KB.

### Deploy

The bundle is served at `https://sdk.130-61-158-79.sslip.io` from the k3s server, as
its own Helm release (`clan-sdk`, chart in `deploy/helm/sdk`) in the `clan` namespace.
It is separate from the `clan` release of clan-backend: deploying the SDK needs no
change there. It reuses that release's registry pull secret (`gitlab-registry`) and
certificate issuer (`clan-letsencrypt`), so clan-backend must be installed first.

- **Every merge to `main` is deployed.** The pipeline on `main` runs `test`, `images`,
  then `deploy`, which runs `deploy/deploy.sh "$CI_COMMIT_SHA"`. `develop` only tests
  and builds the image. A release is an MR `develop` -> `main`.
- `deploy/deploy.sh <tag>` copies the chart to the server over SSH and runs
  `helm upgrade --install clan-sdk ... --set image.tag=<tag> --wait`. If the new pod is
  not ready within 5 minutes the deploy fails and the old pod keeps serving.
- The job needs the CI/CD variables `DEPLOY_SSH_KEY_B64` and `DEPLOY_SSH_KNOWN_HOSTS`
  (protected, the same two clan-backend uses), and `main` must be a protected branch.
- Check a deploy: `curl -I https://sdk.130-61-158-79.sslip.io/v1/clan-sdk.js` returns
  200 with `Access-Control-Allow-Origin: *` and `Cache-Control: no-cache`.
- Which build runs, and rolling back: GitLab -> Operate -> Environments ->
  `sdk-production`, where an older deploy can be run again.
- A new `@clan/ui` reaches games only after `npm update @clan/ui` here (it moves
  `package-lock.json`; the image installs exactly what the lock file says), a merge to
  `main`, and the deploy.

## Minimal game integration

The SDK is hosted: add one script tag and call `init`. There is nothing to install,
build or copy into your game.

| What | URL |
| --- | --- |
| SDK, script tag (defines `window.ClanSDK`) | `https://sdk.130-61-158-79.sslip.io/v1/clan-sdk.js` |
| SDK, ES module | `https://sdk.130-61-158-79.sslip.io/v1/clan-sdk.esm.js` |
| `platformUrl` | `https://platform.130-61-158-79.sslip.io` |
| `socialUrl` | `https://social.130-61-158-79.sslip.io` |
| `realtimeUrl` | `https://realtime.130-61-158-79.sslip.io` |

`/v1/` always serves the newest release and is never cached, so a fix reaches every
game on its next page load. Use this address; the pinned `/<version>/` path described
under "Docker asset server" is not offered to games yet.

**The game owns the button.** The widget has no launcher of its own: it draws the
panel, always open, inside the container you give it. Show and hide that container
with your own button, as the examples do, or mount the widget when the player opens
it and call `widget.destroy()` when they close it.

Replace the game ID with one that has a published widget configuration. The example
`/api/player-token` endpoint belongs to **your game server**: it must return
`{ "token": "..." }` for the signed-in player and honor `forceRefresh=true`. It is
not a Clan route.

### Classic script

```html
<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<button id="social-toggle" type="button">Social</button>
<div id="social-widget" hidden></div>
<script src="https://sdk.130-61-158-79.sslip.io/v1/clan-sdk.js"></script>
<script>
  const container = document.querySelector('#social-widget');
  // Your own button opens and closes the widget.
  document.querySelector('#social-toggle').addEventListener('click', () => { container.hidden = !container.hidden; });

  const sdk = ClanSDK.init({
    gameId: '797ed3c3-50ff-49be-ba96-111b493beb82',
    platformUrl: 'https://platform.130-61-158-79.sslip.io',
    socialUrl: 'https://social.130-61-158-79.sslip.io',
    realtimeUrl: 'https://realtime.130-61-158-79.sslip.io',
    getPlayerToken: async ({forceRefresh}) => {
      const response = await fetch(`/api/player-token?forceRefresh=${forceRefresh}`, {credentials: 'same-origin'});
      if (!response.ok) throw new Error('Player authentication failed');
      return (await response.json()).token;
    },
  });
  const widget = sdk.mountExperience({container});
  widget.ready.catch(console.error);
  console.log(ClanSDK.version);
</script>
</html>
```

### Direct browser ES module

```html
<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<button id="social-toggle" type="button">Social</button>
<div id="social-widget" hidden></div>
<script type="module">
  import {init, version} from 'https://sdk.130-61-158-79.sslip.io/v1/clan-sdk.esm.js';
  const container = document.querySelector('#social-widget');
  document.querySelector('#social-toggle').addEventListener('click', () => { container.hidden = !container.hidden; });

  const sdk = init({
    gameId: '797ed3c3-50ff-49be-ba96-111b493beb82',
    platformUrl: 'https://platform.130-61-158-79.sslip.io',
    socialUrl: 'https://social.130-61-158-79.sslip.io',
    realtimeUrl: 'https://realtime.130-61-158-79.sslip.io',
    getPlayerToken: async ({forceRefresh}) => {
      const response = await fetch(`/api/player-token?forceRefresh=${forceRefresh}`, {credentials: 'same-origin'});
      if (!response.ok) throw new Error('Player authentication failed');
      return (await response.json()).token;
    },
  });
  const widget = sdk.mountExperience({container});
  await widget.ready;
  console.log(version);
</script>
</html>
```

The service origins must allow your game's origin through CORS; on the hosted
platform that list is kept by the platform team, so tell us the address your game is
served from. `realtimeUrl` is an HTTP(S) base; the SDK derives WS/WSS URLs. The
container needs no stylesheet.

**Working on the SDK itself, or offline:** run `npm run build` and load
`./dist/clan-sdk.js` (or `./dist/clan-sdk.esm.js`) from a local web server in place of
the hosted URL, with the local service URLs (`http://localhost:8081`, `8082`, `8083`).

Both formats support the same lifecycle:

```js
const container = document.querySelector('#social-widget');
// Optional host notification. The SDK owns Join/Create/search/navigation.
container.addEventListener('clan-sdk:joined', event => {
  console.log('Joined clan', event.detail.clanId);
});

// Explicitly check for a new publication; no polling is installed.
await widget.refreshConfig();
// On game teardown:
widget.destroy();
```

Keep the secret API key and player-token exchange on the game server. The callback must return only the token string, without the `Bearer` prefix. No developer token is needed by W6. The SDK never decodes JWTs or implements registration. Opening the live Friends tab uses the confirmed `GET /players/me` bootstrap for Social identity; init and clan-only flows do not add that request.

`init()` is synchronous and requests neither config nor tokens. Both `gameId` and `platformUrl` are required together to enable Platform loading. `socialUrl` and `getPlayerToken` retain their existing validation. Service URLs are absolute HTTP(S), optionally with a proxy prefix; omit `/api/v1`. Trailing slashes are supported; URL credentials, queries and fragments are rejected.

## Published configuration → shared UI

Mounting without `config` starts **one** public request:

```
GET {platformUrl}/api/v1/public/games/{encodedGameId}/widget-config
200: { "version": 1, "config": { ...current shared config... } }
ETag: "v1"
```

This is the inspected W6 route, not a guessed dashboard/authenticated route. Config requests use `credentials:'omit'`, no Authorization, no API key and no Social token callback. The loader unwraps `config`. Per the user's existing policy, **published config payloads are not SDK-schema-validated**. JSON/W6 envelope checks remain; the shared renderer safely selects supported fields. An unrenderable payload uses the render error boundary. Direct caller updates have minimal type/appearance checks before replacing working UI.

The current document has `schemaVersion:1`, `game_id`, `theme.colors/fonts/frame/buttons/panel/textures/components`, `layout`, `friends`, `clan.screens`, `chat`, and `texts`. It has no prototype `kind` or root `screens`. See the self-contained [SDK regression fixture](test/browser/fixtures/platform-widget-v1.json). The SDK passes the full document to `@clan/ui`; it no longer converts current JSON into old Discover sections.

The config is retained across internal screen/tab navigation. Navigation never refetches config or changes the game's URL. Each view reads the same theme and its own `clan.screens` settings. No config loading is duplicated in the game.

Cache entries retain the backend payload and exact ETag in page memory, keyed by canonical Platform URL + game ID. Subsequent explicit loads/refreshes send that ETag unchanged in `If-None-Match`. A 304 reuses cache without reading the body or checking `ok`; a cacheless 304 retries once unconditionally. Concurrent older results cannot overwrite newer cache entries or local updates.

Initial loading failures (network, timeout, HTTP, JSON/envelope or render errors) use the built-in current-format appearance. Once a widget is mounted, failed `refreshConfig()` rejects and preserves its previous configuration and draft. No player/clan/message sample is supplied. Cached config/ETag is not replaced by a loading failure. Diagnostics log safe categories/status, never credentials or payloads. Caller cancellation/destroy rejects with `AbortError`. Standalone `sdk.loadConfig()` retains its existing default fallback behavior.

## Direct config and lifecycle

Current widget JSON may be unwrapped or wrapped in one top-level `config` object:

```js
import {normalizeWidgetConfig} from './dist/clan-sdk.esm.js';
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

Source/package integrations load curated Google font families with the same `googleFontsHref` as dashboard preview, using reference-counted links cleaned up on update/destroy. Standalone bundles omit those external links and use the renderer's system font fallbacks. Custom asset IDs can be mapped with `mountExperience({container, config, assets:{badges:{...},textures:{...}}})`; missing live clan badges are not inferred from those appearance choices. Platform mounts also accept `assets`.

## Supported shared UI and runtime data

| Config | Shared presentation behavior |
| --- | --- |
| `theme.colors` | Brand, panel background, surface, text and muted colors |
| `theme.fonts` | Curated heading/body families with system fallbacks; source integrations also load Google Fonts |
| `theme.frame/buttons/panel` | Frame, corners, button styles/case, opacity and blur |
| `theme.textures/components` | Shared built-in textures, safe mapped custom assets and per-part overrides |
| `layout.position`, `startCollapsed` | **bottom-left/bottom-right** dock and launcher state. Current schema has no numeric width/height or top corners; the shared component owns responsive sizing |
| `friends/clan/chat.enabled`, `chat.clanChat/directMessages` | Supported tab visibility; fixed Friends → Clan → Chat order |
| `clan.screens.*.enabled` | Discover/Create/Home/Members eligibility and internal navigation |
| `clan.screens.home.showStats` | Shared Home details; SDK suppresses unsupported live level/XP data |
| `texts.terms/labels` | Shared label overrides and `{Clan}`/`{clan}`/`{Clans}`/`{clans}` substitution |
| Ordered `clan.badges.allowed` / `clan.roles` | Shared picker/role presentation order; runtime permission authority remains backend |
| Chat layout/limits | Shared bubbles/log/composer; live Realtime integration below. Server enforces filtering, permissions and slow mode. The SDK mirrors slow mode: after each sent message Send is disabled for the game's `chat.slowModeSeconds`, and from 4 seconds up the button counts the wait down (`12s`, `11s`, …). A wait the server reports (`slow_mode`, `rate_limited`) is handled the same way; no warning text or Retry button is shown for it |

There is **no generic screen/section/tab order field** in the current schema. Old prototype section arrays/hero layouts are not a second design system. Unknown fields remain in config; the renderer only consumes its supported fields. Minimal direct checks are not a full copy of the frontend's proposed strict JSON Schema validator and do not enforce permissions.

Live runtime flow:

1. If clan is enabled, call `myClan()`. Only `404 not_in_clan` means no membership; other errors are visible with Retry.
2. No clan → Discover → `listClans({q})`. Search is debounced 250 ms; stale results cannot replace newer searches. Server errors, loading, empty and retry are shown. Capacity comes from each response's `memberCount/maxMembers`, never from config. No runtime emblem, tag or description is fabricated.
3. Join → `joinClan(id)` once while pending → `clan-sdk:joined` → re-read `myClan()` → real Home data. No optimistic fake membership.
4. Create uses the supplied shared form and **only `{name}`** with `createClan`. Badge/tag/description controls are disabled in live mode because the backend doesn't accept them. Duplicate writes are guarded. Server errors remain visible; success refreshes membership.
5. Members → `clanMembers(id)`; map `playerId/displayName/role` to shared rows. Current Social UUID is not available in these membership responses, so no guessed `(you)` marker. Header role comes from `myClan`.
6. Friends and incoming/outgoing requests use the confirmed Friends API described below. With `realtimeUrl`, chat uses real room/history/send/incoming contracts described below; without it, unavailable drafts remain intact. Leave is integrated as described below; kick/promote/demote remain disabled. Config cannot grant backend permissions.

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
await sdk.blockPlayer(friends[0].id);
const {blocks} = await sdk.listBlocks();
await sdk.unblockPlayer(blocks[0].id); // Does not restore friendship.
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
| `listBlocks()` | GET `/api/v1/players/me/blocks` → 200 `{blocks:[{id,displayName,since}]}` |
| `blockPlayer(playerId)` | POST `/api/v1/players/{id}/block`, no body → 204, idempotent |
| `unblockPlayer(playerId)` | DELETE `/api/v1/players/{id}/block`, no body → 204, idempotent |

**ID namespaces:** send/remove/block/unblock use the **Social player UUID**, from search, friend lists, blocked lists or member lists. `externalId` is the game's own identifier and is never substituted for that UUID. Accept/decline/cancel use the **request UUID**, not `entry.player.id`. The server infers caller/game from the token. `getMyPlayer` reuses the backend's idempotent EnsurePlayer path; no extra registration endpoint/key is introduced.

Search requires nonblank q (1–50 characters after server trimming), optional integer limit1–100, default100. The server excludes self/other games and returns relations `none`, `friend`, `request_sent`, `request_received`, `blocked`; pending relations include `requestId`. Caller-blocked search results offer Unblock. Players who blocked the caller are hidden by Social. DTO adapters remain internal to the SDK and never fabricate online presence.

Initial loading requires `friends.enabled === true` and opening Friends. It uses shared `@clan/ui` rows, friend-management confirmation and Blocked section. SDK bindings add Add/Decline/Cancel/Remove/Refresh controls to those existing rows, without copying a screen or changing dashboard props. Search is debounced250ms; stale searches/loads and results after navigation or destroy are ignored. Blank input restores the friend list without sending an invalid empty search. Both request directions are displayed. Loading, empty, failure/Retry, pending and duplicate-click guards are explicit. Successful mutations refresh friends, requests, blocked players and an active search; there is no optimistic fake friendship. 404/409 conflicts refetch while keeping the server's action error visible, without retrying the mutation. Other errors retain status/code/message through ApiError, including self, duplicate, already-friends, unavailable player and sender/receiver permission errors.

Select a friend, choose **Block**, and confirm using the published UI's controls.
Blocking removes friendship and pending requests in either direction. The SDK
reloads all three collections and their counts, and clears that DM's messages,
draft and pending send. The **Blocked** section loads actual Social players and
its **Unblock** button removes only the caller's block. Unblock does not restore
friendship, requests or DM membership; a new accepted friend request is required.
Clan chat follows its existing membership rules. Pending mutations disable
actions; realtime refreshes cannot release the duplicate-request guard.

The widget also exposes `await widget.refreshFriends()` (after `ready` for a Platform handle). It refreshes an enabled, open Friends view; otherwise it does no work. Reopening the tab also refreshes. There is no polling. When live Realtime is enabled, friend notifications, conversation membership events and reconnect also refresh enabled Friends state in the background. Social's `player.blocked`/`player.unblocked` broker events are private and are not websocket notifications; `conversation.removed` revokes the remote DM. Real conversation presence comes from Realtime, never preview data.

TEAM-250 verification: **298 Node tests**, **97 browser regression tests against
built output with mocked services**, plus a separate live built-ESM browser check
with two disposable players against local Social/Realtime. Block/unblock,
reload persistence, both players' friendship/DM state, rejected messages in both
directions and explicit re-friending passed. SDK **0.1.1** still bundles published
`@clan/ui` **0.1.30**; no dependency change was needed. See
[TEAM-250 results](TEAM-250.md) for contracts and the opt-in live command.

**Player-session changes:** keep token renewal bound to the same player. When your host switches accounts, first change the callback's current-player source and immediately call `sdk.resetPlayerSession()` in the same synchronous host operation (or destroy widgets and create a new SDK). Reset invalidates pending authenticated responses and token callbacks, destroys old UI state/drafts/controllers, and restarts each SDK-owned widget with the new callback. Widgets on another SDK instance are unaffected. No JWT is decoded and token rotation alone does not mean an account switch. To change games or service settings, create a new SDK with the new initialization options. A request already committed by Social cannot be undone; its old UI result is ignored.

```js
currentPlayer = nextPlayer; // your callback reads this host-owned source
sdk.resetPlayerSession();
```

Verification: **225 Node tests**, **70 real-browser mock tests**, and **8 live PASS groups** against local Social with two isolated dedicated test players (includes relationship cleanup). No FAIL/BLOCKED live operations in that run. This verifies the HTTP SDK against the running service, not its deployed SHA, browser CORS, Platform token exchange or websocket delivery. The Node-only runner used the existing local development signing key in memory and logged no tokens; dedicated player records remain, relationships were removed. See [Friends report](docs/friends-integration.md) for exact source revisions, limitations and changed files.

Run mock tests with `npm test` and `npm run test:browser`. Live tests are **opt-in**, never part of npm test: `node test/live/friends.js --local-dev-key` requires an explicitly supplied `FRIENDS_LIVE_DEV_KEY` external development signing-key path. Alternatively provide `FRIENDS_LIVE_SOCIAL_URL`, `FRIENDS_LIVE_DEDICATED=1`, `FRIENDS_LIVE_TOKEN_A/B` as environment variables for two dedicated players whose external IDs start with `sdk-friends-test-`; run without the flag. The opt-in live Chat fixture requires `LIVE_CHAT_DEV_KEY` and running development services. No backend checkout or development key is needed for SDK installation, normal tests or preview. Tokens and keys are never printed. Do not use real player accounts for this relationship lifecycle test.

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

The earlier editor check redirected to login; authenticated-editor visual verification remains unavailable. The earlier272 frontend/shared-schema tests and comparison page verify the supplied shared UI subset. The later live chat verification and minimal Harvest connection-settings change are recorded separately below.

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

## Live chat

`mountExperience` now connects the existing shared Chat and clan-chat components
to Realtime when `realtimeUrl` and the published chat switches enable it. Omit
that option to retain explicit unavailable messaging. Legacy chat-only mount APIs
retain their previous behavior. `init` remains free of network requests.

The SDK acquires the same player token as Social, opens `/api/v1/ws?token=…`,
waits for authenticated `hello`, then reads `GET /api/v1/conversations` and the
selected conversation's `/messages` history. HTTP uses Bearer auth and the
existing one-401 retry. Socket token expiry requests `forceRefresh:true` through
that same acquisition coordinator. Never log the WebSocket URL; use HTTPS/WSS
outside local development. Configure Realtime's allowed browser origins and the
host page's CSP `connect-src` for both HTTP(S) and WS(S) service origins.

Public read methods return successful backend JSON unchanged:

```js
const {conversations} = await sdk.listConversations();
const {messages, hasMore} = await sdk.listMessages(conversations[0].id, {
  limit: 20, // 1–100, default 50
  // before: oldestMessageId, // older page, newest first on the wire
});
```

The widget owns selection, history, send and receive; the game needs no message
handlers. It sends `message.send` using the **returned conversation ID**, clears
the draft only after ACK, and displays final stored text from `message.new` or
history. Pending/error/disconnected/empty states use the shared renderer without
SDK-injected Refresh, Reconnect or Load earlier buttons. Hosts can explicitly
reconnect through `widget.reconnectChat()`. Unknown delivery is never replayed
automatically. Reconnect reloads membership/history, pages back to the last known
message, merges incoming frames and deduplicates by message ID. The initial page
uses `chat.historyLimit` capped at the backend maximum100, default50 if absent.

DM rooms are provisioned after friendship acceptance. The latest inspected
backend also provisions clan rooms from Social membership events. Opening a
socket never creates either room. SDK uses actual returned conversation IDs;
see TEAM-226 below for the current implementation and live-verification limits.

`widget.destroy()` closes the socket, detaches listeners and cancels timers;
pending responses cannot repaint. For logout destroy first, then clear the host
token cache and call `sdk.resetPlayerSession()`. For account switching update the
callback's identity source and reset synchronously, or recreate the SDK. Widgets
on that SDK reset their data/drafts and reconnect for the new identity. Token
rotation alone cannot identify an account switch.

`config.updated` and positive `hello.configVersion` emit
`clan-sdk:config-updated` (`{version}`). Platform-mounted handles compare against
the loaded publication version (not schemaVersion), coalesce duplicate notices,
and refresh through the existing loader/cache after0–500ms jitter with stale guards;
direct-config hosts may handle this event themselves. No polling is added.

See [live chat integration](docs/live-chat-integration.md) for inspected revisions,
changed files, automated results, the real two-player browser check and its limits.

## Leave clan (TEAM-214)

```js
await sdk.leaveClan(clanId);
```

Bodyless POST `/api/v1/clans/{encodedClanId}/leave`, Bearer player auth through
getPlayerToken, with the existing one-401 fresh-token retry. Confirmed204 returns
undefined; other successful JSON follows the unchanged low-level HTTP convention.
Errors retain status/code/message. No automatic network/404/409 retry.

The shared Home info panel and Members screen already provide Leave and its
confirmation. The SDK binds their existing actions.leave, shows Leaving clan…,
and prevents duplicate submissions. Only confirmed success clears membership,
role, members, join/search state and the old clan room/history. It uses configured
Discover (or Create fallback), without reload. If the player navigated to Friends
while waiting, that active tab is retained. Errors preserve membership and show
server text safely; the player can retry via the existing confirmation.

Owners may leave: the server chooses the earliest remaining member as owner
(ties use player ID), or deletes the clan when empty. No invented leader ban is
applied. Confirmed failures include404 clan_not_found,409 not_in_clan and403
origin_not_allowed; ordinary authentication/service failures also remain errors.

Direct-message history and its existing WebSocket remain connected. Pending old
clan reads/events are ignored, including stale room-list snapshots; dispatched
HTTP requests are not undone. Backend Realtime membership removal remains the
permission authority. Account switching still requires resetPlayerSession or
widget teardown, as documented above. Public leaveClan is a low-level HTTP call;
the mounted panel action owns the UI transition and emits clan-sdk:left {clanId}.

Verification and changed files: [TEAM-214 report](TEAM-214.md).

## Realtime clan chat (TEAM-226)

The SDK reuses the same authenticated Realtime connection for DMs and clan chat.
After hello it reads conversations, matches kind:clan with the current Social
clanId, and loads history using that room's actual id. The shared Home/Chat UI
receives final server text; ACK/new/history overlap is deduplicated by room and
message IDs. Failed or unknown sends keep the draft and are never auto-replayed.

Membership events/known clan notifications refresh Social state or invalidate it,
remove the old room and pending reads, and clear its draft even when hidden.
Unrelated DMs and their connection survive. New confirmed membership can reactivate
an existing room/history. Unknown notification kinds are ignored. Clan online
values are snapshots; friend-only presence frames do not create live clan presence.

Recoverable closes use exponential backoff starting at1s and capped30s with jitter;
1008 waits30s;4001 forces shared token refresh;4403 destroys the panel and stops.
The host may observe clan-sdk:suspended {code:4403}; do not remount in a loop.
After reconnect, hello/list/history recovery catches missed messages without resend.

Minimal game integration is unchanged: init with gameId, platformUrl, socialUrl,
realtimeUrl (HTTP/S base, e.g. http://localhost:8083) and getPlayerToken, then
mountExperience({container}). Published config must enable clan.enabled,
chat.enabled and chat.clanChat. Backend CORS must allow the exact game origin
(e.g. http://localhost:5173); host CSP must allow HTTP/S and WS/S connections.
No game-side chat transport/state or secret API key is needed in the browser.

Current results and live blockers: [TEAM-226 report](TEAM-226.md).
