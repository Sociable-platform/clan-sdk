# Configuration and lifecycle

How a published widget config becomes the shared UI, passing a config directly, the widget lifecycle, and the supported UI and runtime data. Back to the [README](../README.md).

## Published configuration → shared UI

Mounting without `config` starts **one** public request:

```
GET {platformUrl}/api/v1/public/games/{encodedGameId}/widget-config
200: { "version": 1, "config": { ...current shared config... } }
ETag: "v1"
```

This is the inspected W6 route, not a guessed dashboard/authenticated route. Config requests use `credentials:'omit'`, no Authorization, no API key and no Social token callback. The loader unwraps `config`. Per the user's existing policy, **published config payloads are not SDK-schema-validated**. JSON/W6 envelope checks remain; the shared renderer safely selects supported fields. An unrenderable payload uses the render error boundary. Direct caller updates have minimal type/appearance checks before replacing working UI.

The current document has `schemaVersion:1`, `game_id`, `theme.colors/fonts/frame/buttons/panel/textures/components`, `layout`, `friends`, `clan.screens`, `chat`, and `texts`. It has no prototype `kind` or root `screens`. See the self-contained [SDK regression fixture](../test/browser/fixtures/platform-widget-v1.json). The SDK passes the full document to `@clan/ui`; it no longer converts current JSON into old Discover sections.

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

All formats load curated Google font families with the same `googleFontsHref` as dashboard preview, using reference-counted links cleaned up on update/destroy. Config updates load the newly selected families; multiple widgets share a stylesheet until its last user is destroyed or switches fonts. System fallbacks remain available. Custom asset IDs can be mapped with `mountExperience({container, config, assets:{badges:{...},textures:{...}}})`; missing live clan badges are not inferred from those appearance choices. Platform mounts also accept `assets`.

## Supported shared UI and runtime data

| Config | Shared presentation behavior |
| --- | --- |
| `theme.colors` | Brand, panel background, surface, text and muted colors |
| `theme.fonts` | Curated heading/body families loaded automatically in all formats, with system fallbacks |
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
4. Create uses the supplied shared form and `createClan({name, badge?, description?})`. The badge picker offers the published allowed IDs and sends the selected ID, not its image. Description is saved through the same Social contract; the current renderer does not offer a tag field. No allowed badges means the nullable UI selection is omitted from the request. Duplicate writes are guarded; pending requests disable badge/details controls. Server errors retain the form for retry; success refreshes membership. Saved badges/details are mapped from backend responses and remain visible after reload and in Discover. Missing badge fields do not invent a saved selection.

For an opt-in local-service badge/reload check, build first, set
`LIVE_BADGE_DEV_KEY` to an external development signing-key path and
`LIVE_BADGE_GAME_ID` to a configured development game with at least two badges,
then run `node test/live/badge.mjs`. It uses the real published configuration,
creates one disposable player/clan, checks a non-default saved badge after
reload, and leaves/disbands only that test clan. Google Fonts delivery is mocked;
Platform/Social are real. No key/token is logged or shipped in the SDK.
5. Members → `clanMembers(id)` plus a fresh `myClan` read; map `playerId/displayName/role` to shared rows. The viewer is matched only by the confirmed Social UUID from `getMyPlayer` (Friends enabled) or the Realtime hello, never guessed. Header role comes from `myClan`.
6. Friends and incoming/outgoing requests use the confirmed Friends API described below. With `realtimeUrl`, chat uses real room/history/send/incoming contracts described below; without it, unavailable drafts remain intact. Leave and member promote/demote/kick are integrated as described below. Config cannot grant backend permissions.

The bridge currently uses documented-in-source `.sk-*`/`data-key` hooks for async search/status, per-row runtime capacities and unavailable actions. This keeps all markup/styles in the canonical package, but those hooks are a frontend API dependency; see integration gaps. No live service success or deployed-build SHA is implied by mock tests.
