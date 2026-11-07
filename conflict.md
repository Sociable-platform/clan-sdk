# SDK compatibility review and implementation decisions

## 2026-11-07: complete-experience structural format separation

The user supplied `kind: "clan-complete-ui"` input and requested structural-only validation. The initial reference fixture uses version 1 (the attachment's 2 changed to 1); numeric version validation remains the requested finite-positive check, not renderer capability gating. Added `validateExperienceConfig` preserving the original object/additional fields and checking only the essential structure and per-screen section ID uniqueness. No shared backend or component contract was modified.

Confirmed SDK format-dispatch issue: before this change, `src/config/chat.js:normalizeChatConfig` ignored the new complete-experience kind and could accept a version-1 document by dropping screens/other fields and applying chat defaults. Resolved within SDK scope by explicitly rejecting `clan-complete-ui` at `kind` with `unsupported_config_format`, while exposing structural validation separately. Existing chat defaults and valid legacy inputs remain unchanged. No complete-experience renderer/adapter is inferred from validation, and unchecked content/permissions remain untrusted.

Changed files: `src/config/experience.js`, `src/config/chat.js`, `src/index.js`, `test/experience-config.test.js`, `test/fixtures/config/complete-experience-v1.json`, `package.json`, README, this report, and the two local contract/gap documents. Actual `npm test`: **127 passed, 0 failed** (17 new structural tests and all 110 existing tests). No new rendering/networking/permission implementation, Jira update or remote merge claim was made.

## 2026-11-07: caller-URL config loading clarification

The user authorized production remote loading from a caller-selected `configUrl`, without inventing a team backend route/auth contract. This resolves the earlier SDK-only loader deferral while preserving the unresolved published-config contract (CFG-05). Added real HTTP loading/status/JSON validation and a remote mount handle that delegates to the existing direct mount/update, preserves drafts on refresh/failure, cancels initial loading and aborts/ignores superseded or destroyed refreshes. No shared endpoint/storage, auth/token, renderer, chat protocol or clan contract was changed. No fresh all-repository compatibility/merge claim is made in this task.

Production source contains no mock data. Only the development server wires provisional `GET /__dev__/chat-config`, with bare chat-v1 fixtures and explicit error simulations. The preview uses the production remote mount/refresh API and keeps JSON overrides optional/local. Results: **110 Node tests, 41 real-browser tests passed**, including development HTTP round trips, update races, cancellation and failure retention. The manual preview Refresh changed appearance without clearing its draft. Final shared visuals, publishing/storage semantics, clan configuration and transport remain dependencies.

Files changed for remote configuration loading (pre-existing uncommitted S-04 work was preserved):

- Production: added `src/config/load.js`, `src/ui/remote-chat-widget.js`; updated `src/index.js` and factored the existing container check in `src/ui/chat-widget.js`. The temporary renderer, normalizer and Social request/client implementations were not changed in this task.
- Tests/development HTTP: added `test/config-load.test.js`, `test/browser/remote-config-tests.js`, `test/dev-config-endpoint.js`; updated `test/widget-api.test.js`, `test/browser/widget-tests.js`, `test/browser/server.js` and the root `package.json` test command.
- Preview: updated `preview/index.html` and `preview/preview.js` to use production remote mount/refresh and optional local debugging.
- Documentation: updated `README.md`, this report, and ignored local `docs/sdk-contract-map.md` / `docs/integration-gaps.md`. No ignore rule, backend repository, published endpoint, transport or Jira state changed.

Review date: 2026-11-06. Task: S-03 from `team-81-complete-sdk-guide.md`, minimal widget mount/update/destroy lifecycle. This report separates implemented code, planned contracts, unfinished dependencies and confirmed discrepancies. No other team's source, remote branch, shared contract or Jira issue was changed.

## Later architecture clarification / S-04

The earlier review below is a dated snapshot, not a new claim of rechecking all remotes for S-04. The frontend remote alone was freshly checked during S-04: its Git read request succeeded but returned no HEAD/branch/MR refs. Shared UI components remain an unfinished frontend dependency. The user explicitly requires the dashboard preview and game SDK to share the same supplied visual components; the local UI is temporary and must be replaced behind the renderer boundary, not developed into a duplicate permanent implementation. No shared component props/framework are assumed and no framework dependency was added.

Chat S-04 implemented compatible temporary rendering through `src/ui/chat-renderer.js`, delegated to `src/ui/renderers/placeholder-chat.js`; state/lifecycle stay in the SDK, normalized config remains centralized, and input/submit callbacks do not invoke a transport. The rendered view shows disconnected/empty/unavailable states, configured tab/icon/colors/radius/size/position, and an unavailable composer. No fabricated messages are appended. `preview/` is a development host only. README and local integration gaps record the replacement plan and CFG-06 hand-off. Final visual integration is **not complete**. Clan-config and transport dependencies remain separate and unresolved.

Actual S-04 verification: `npm test` **94 passed, 0 failed**; existing `npm run test:browser` server plus real browser navigation **24 passed, 0 failed**. The preview config editor was exercised: changing size/theme/tab label preserved an unsent draft. No new merge computation was performed for S-04; prior S-03 merge-tree results below apply only to their exact recorded snapshots.

## Remote evidence inspected before implementation

| Repository | Branch / ref | Exact commit inspected | Evidence / scope |
| --- | --- | --- | --- |
| [clan-backend](https://gitlab.com/clan-platform/clan-backend) | Default `main` | `cc5c21d283e8be1ea14026080805417f9f06330a` | Fetched into a temporary bare snapshot; inspected handlers/services, both OpenAPI files, HTTP/CORS/JWT helpers, config, README and `.env.example` |
| clan-backend | `chore/claude-rules`; open [MR !1](https://gitlab.com/clan-platform/clan-backend/-/merge_requests/1) targeting `main`; `refs/merge-requests/1/head` | `7f5c1de7a12ac85c94665adc206cd607fbdb2a4c` | MR status/author/branches verified in signed-in GitLab UI. Diff contains only five `.claude` rule/architecture documents; relevant proposed contracts were inspected, not treated as live endpoints |
| [clan-sdk](https://gitlab.com/clan-platform/clan-sdk) | Default `main`; `nuray/feature/client` | Both `f9cdc5cec9d32ebc463251fc910240f632137f07` | Fresh `git fetch origin`; inspected root entry, package, README, Social client/tests and compared committed trees. Local S-02 files are uncommitted additions on this base |
| [clan-frontend](https://gitlab.com/clan-platform/clan-frontend) | No advertised HEAD/default branch or branch refs | None: empty repository | `git ls-remote --symref` succeeded with no refs. No dashboard code/config export exists to inspect |
| [demo-game](https://gitlab.com/clan-platform/demo-game) | No advertised HEAD/default branch or branch refs | None: empty repository | Same successful empty-ref check; no integration/token server code exists to inspect |

The authenticated GitLab group Open merge requests page showed exactly one open MR, backend !1. No active SDK/frontend/demo MR was listed. These are snapshot facts, not a promise that the branches will remain unchanged. The earlier repository-scoped credential could not list group projects via the API (403); this review used Git access and the signed-in browser instead, and successfully checked the group MR list. No remote access failure occurred in this review. Empty repositories are unfinished work, not inaccessible repositories.

Coverage is limited to existing source and documentation. No running backend, database, production token exchange, full dashboard config export or real WebSocket protocol was available to exercise.

## Git conflict checks and their limits

- SDK local committed HEAD, fetched `origin/main` and `origin/nuray/feature/client` are the same commit. `git diff --name-status HEAD origin/main` is empty and both committed tree IDs are `9a08d6027b472eae6f7555a1f08a9eebd366ccb2`. This proves no committed branch divergence at inspection; it does not by itself test a merge of uncommitted work.
- Backend `git merge-tree --write-tree main chore/claude-rules` ran against fetched objects in the isolated temporary bare repository and exited 0, producing tree `5ad584c0fa9c53d6f23370347c079b4785e4f09c`. No content conflict was reported for that exact pair. This is a local merge computation, not a merged MR or runtime compatibility guarantee.
- No frontend/demo merge can be tested without commits. Cross-repository runtime compatibility is not a Git merge question.
- Final SDK check: copied tracked and non-ignored untracked working files into a separate temporary local clone, wrote snapshot commit `def557245ecce37e8854f4db16f3b175d701cad8` (parent `f9cdc5c`, tree `0f7299d069c494c59fab391105972fd4c38564c4`) using `git commit-tree` only in that clone. Both `git merge-tree --write-tree <snapshot> refs/review/main` and the same command against `refs/review/client` exited 0, each returning the snapshot tree. Both target refs are the inspected `f9cdc5cec9d32ebc463251fc910240f632137f07`. This verifies no content conflicts for those exact SDK snapshots, including the previously uncommitted S-02 implementation and new S-03 code. Ignored local `docs/` and this report's subsequently appended verification metadata are outside that snapshot. It does not prove compatibility with future branch changes. Original working branch/index/history were not changed by the check; only the authorized fetch updated remote metadata. Nothing was pushed.

## Compatibility matrix

| Area | Expected SDK behavior | Remote actual behavior | Finding / S-03 impact |
| --- | --- | --- | --- |
| Clan HTTP | Existing five `/api/v1` methods; JSON `{ name }` create; opaque successful JSON | Backend `Routes()` and OpenAPI currently list only `/health` and `/ready`; catch-all returns 404 `not_found` / `Route not found` | **Dependency D-01**, not a conflicting alternate clan API. Do not convert this missing-route 404 into no-clan success. Pure shell work can proceed |
| HTTP errors / CORS | Preserve `{ error: { code, message } }`; Bearer + JSON headers | `pkg/httpx/errors.go` exactly matches envelope; CORS allows `Authorization, Content-Type`, GET/POST etc.; Social default origin `http://localhost:5174`, Platform `http://localhost:5173` | Compatible implemented helpers. Browser integration against the real service not exercised; demo harness has no backend calls |
| Player auth | `getPlayerToken()` callback; no secret/browser registration or hidden bootstrap | OpenAPI declares Social Bearer JWT and Platform `X-API-Key`, but issuance/auth middleware is not yet wired. JWT helper implements Ed25519 | **Dependency D-01**. Keep token callback opaque; do not add secret headers to the browser |
| Token claim naming | Local current brief says JWT contains `game_id`; older retained examples say `pid` | Backend `pkg/jwt.Claims.GameID` uses JSON key `gid`; MR !1's architecture explicitly agrees with `gid` | **Confirmed documentation discrepancy C-01**, no current SDK runtime failure because it never decodes claims |
| Widget config | S-02 chat `schemaVersion: 1` subset/defaults; clan design separate | Backend has no widget-config storage/export endpoints/schema. MR architecture places widget config in a later phase. Dashboard is empty | **Dependency D-02**, not proof the SDK's direct-config subset conflicts with a real dashboard schema |
| WebSocket/events/reconnect | No transport in S-03; shell must report disconnected | No Realtime service or WS/event/reconnect implementation in backend. MR declares it future work | **Dependency D-03**. No invented URL, envelope or connection status |
| SDK integration | Preserve five Social methods; later additive mount API, handles with update/destroy | Remote SDK contains only the core Social client. Frontend/demo have no consumer implementation | Additive chat mount is safe relative to inspected consumers; real consumer compatibility remains untested |
| Clan mount | `mountClanPanel` needs an authentic separate clan adapter | Only discriminator/version and design prose exist locally or in remote inspected files | **Dependency D-02** blocks that mount. Leave clan API/renderer unimplemented rather than accepting chat config or inventing fields |

## C-01 — Token-claim documentation versus implementation

Affected: `clan-backend/main@cc5c21d`, `pkg/jwt/jwt.go`, `Claims.GameID`; SDK `system_architecture.md`, current player-auth scope and retained `pid` examples; local `docs/sdk-contract-map.md` and `docs/integration-gaps.md` claim descriptions. MR !1 `chore/claude-rules@7f5c1de` documents the actual `gid` claim.

Expected versus actual: earlier SDK brief calls the JWT game claim `game_id`; current helper serializes `gid`. Database column naming does not establish token JSON naming. Impact: future client-side identity/game extraction based on the brief would be wrong; S-03 needs no token decoding, so its compatible scope is unaffected.

Options:

1. Change the backend claim to `game_id`: aligns the older brief but changes a shared token contract and could break consumers. Requires explicit team agreement; not SDK scope.
2. Record observed `gid` and keep SDK tokens opaque: matches current code, avoids token trust/identity assumptions and requires no shared contract change. **Recommended.**

Resolution within SDK scope: update local contract notes/README to distinguish observed JWT `gid` from database `game_id`; preserve callback/Bearer behavior and defer current-player ID mapping to a real profile/member contract. No backend token code changed. Team dependency: Murad owns Platform token issuance per Member A T7; Farida owns Social verification per Member B T9. Confirm final issuance/consumer contract when those endpoints land; ownership of any separate shared-helper change is unconfirmed.

## C-02 — README contract links are not present in the remote SDK

Affected: SDK `main@f9cdc5c`, `.gitignore` rule `docs/`, README contract links, untracked/ignored local `docs/sdk-contract-map.md` and `docs/integration-gaps.md`.

Expected versus actual: README links should resolve in a fresh clone/GitLab, but the linked docs are ignored and absent from the remote tree. Impact: teammates cannot read the contract/gap evidence through those remote links. Runtime mounting is unaffected. SDK ownership is Nuray per Member C; intent of the ignore rule is unconfirmed.

Options: remove the ignore rule and track the selected docs (shared evidence, but changes a deliberate repository policy), or retain local-only docs and move essential review/usage facts to tracked README/root `conflict.md` (avoids changing ignore policy but duplicates selected context). **Recommendation:** team decides whether the contract docs should be shared; until then preserve `.gitignore`, put current compatibility evidence here and make README explicitly identify the local-only links. No force-add or push performed. This documentation issue is mitigated, not fully resolved remotely.

## Dependencies, blocked scope and concrete next steps

### D-01 — Missing player/clan/token endpoints

Affected: backend `main` handlers/services/OpenAPI; empty demo server; existing SDK Social methods. Not a confirmed incompatible implementation: these routes are not written yet. Keep provisional response fixtures and preserve API 404/errors. Farida's T9-T14 and Murad's T7 from the briefs are the supported hand-offs. Obtain exact DTOs/no-clan discriminator/member-ID mapping and a trusted game token callback; then exercise real browser CORS and two-player clan flows. Do not solve it by changing the SDK routes or adding profile bootstrap without agreement.

### D-02 — No authentic clan design export / dashboard schema

Affected: empty `clan-frontend`, SDK `src/config/chat.js`, proposed clan adapter and `mountClanPanel`. Inspecting both repos/MR found no full `kind: "clan-experience-design-proposal", version: 1` artifact. Owner of this new design-export deliverable is unconfirmed (the original briefs assign dashboard work to Murad but not this additional schema).

Options: invent a temporary clan schema (fast, likely incompatible), reuse chat JSON for clan (contradicts agreed separation), or defer clan adapter/mount while building the reusable chat lifecycle. **Recommended:** implement only `mountChatWidget` now, leaving clan mount absent and documenting partial S-03 completion. Team must supply/version the actual clan export and supported screens/required sections before adding its separate normalizer and mounting it through the same lifecycle. Chat direct-object normalization remains an SDK MVP subset, not full dashboard compatibility.

### D-03 — No current chat protocol or config publishing implementation

Affected: backend default/MR architecture, frontend and demo; SDK future chat transport/config loader. Protocol ownership for the planned extra chat phase is unconfirmed; the current Member B brief assigns two-service clan scope only. Keep shell explicitly disconnected with no Send/history/fake successes; no WS/reconnect/published-config code. Later obtain versioned service/auth/channel/history/send/ack/message-ID/replay contracts and implement a separate adapter. This does not block S-03 chat lifecycle.

## S-03 implementation and validation

Implemented the compatible chat portion only:

- `src/ui/chat-widget.js`: validated container/config, one active mount per container across SDK instances, private host + Shadow DOM, safe heading text and explicit disconnected status; floating corner positioning with viewport clamps; full-replacement atomic config updates; independent instances; idempotent destroy preserving game-owned content and allowing remount.
- `src/index.js`: additive `sdk.mountChatWidget({container,config})` on the SDK prototype; the five existing own Social methods and all original tests remain unchanged. Import/init require no DOM. No clan mount is exposed until its adapter exists.
- `test/widget-api.test.js`: Node-only additive API/import/validation checks. `test/browser/`: dependency-free local HTTP test server and real DOM/computed-style assertions, including mobile-size iframe viewports and hostile host CSS.
- README/package scripts and ignored local contract notes updated. No tokens, HTTP, timers, subscriptions, messages, Send action, reconnect logic or backend configuration storage were added. There is no pending async work in the shell; updates after destroy reject rather than recreating UI.

Actual verification:

| Check | Result |
| --- | --- |
| `npm test` | **91 passed, 0 failed**: original 53 Social + 36 config tests, unchanged, plus 2 widget API tests |
| `npm run test:browser` + browser navigation to local test page | **14 passed, 0 failed**, observed in the actual browser results page. Checks cover mount/disconnected state, four corners, duplicate mounts, invalid input, atomic update, node preservation, independent instances, owned-content cleanup/remount, post-destroy guard, CSS isolation, safe text, config-copy isolation and narrow/resized iframe viewports |
| `git diff --check`; isolated snapshot `git diff --check HEAD <snapshot>` | Passed (Git emitted only LF/CRLF conversion notices) |
| Backend MR / isolated SDK merge-tree computations | Exit 0 for the exact refs/snapshots recorded above |
| README/conflict/local-doc relative links and code fences | Verified in this workspace; local-only docs remain intentionally untracked pending C-02 decision |

The first browser server attempt ran inside the sandbox and could not be reached; restarting the same server outside the sandbox allowed the browser tests to execute. No security/browser settings were altered. The development server was stopped after verification. The server command itself serves a browser harness; it is not a headless/CI exit-code runner. No live backend/browser CORS, token issuance, clan DTO flow or chat transport was tested.

Remaining blockers: authentic clan export/adapter (clan mount), implemented backend clan/token routes and exact player/member DTOs, dashboard persistence/export contract, and versioned chat transport contract. Missing code is a dependency, not an automatically declared integration conflict. Full two-widget S-03 is **partially complete**; the compatible chat lifecycle is implemented and verified.
## 2026-11-07 — Discover implementation / latest compatibility check

This dated entry supersedes earlier “no clan export/rendering” and active-MR
statements for the Discover scope only. Earlier entries retain their original
snapshot dates and results. Git access succeeded for all four projects. The
authenticated group merge-request page showed **0 open, 8 merged**; fetched MR
refs are historical snapshots, not active MRs. No other team's repository was
modified and nothing was pushed.

| Repository / ref | Inspected SHA / evidence |
| --- | --- |
| clan-backend default `main` | `0b5e67c8e60a86944a168f6cd017947335c3f917`; Social routes/service, OpenAPI, HTTP errors/JWT helpers, architecture |
| clan-backend `develop` | `4ef8def351cd7f176ee1678133b5471321b73e38`; Social routes, OpenAPI, auth middleware, migrations/tree |
| clan-backend historical MR !8 head | `8ca1ffad9d07f16ca2b8703b37e118f9f3000285`; relevant Social handler/auth/schema snapshot; diff against develop |
| clan-backend `feat/TEAM-88-game-api-keys` | `50f0776eaf0e9f3be7a0a6e90ac6c180a86afaca`; route/OpenAPI inventory and relevant Social handler; Platform API-key work does not establish clan DTOs |
| clan-backend `feat/TEAM-87-register-existing-game` | `bde3b20954175b15d026a11f73703f6413ed78d2`; changed-file inventory against main: Platform registration, not a clan contract |
| clan-backend `chore/compose-auto-migrate` | `c60f6c681bee0aeb04b542f4cbe9d1c3b442d2cf`; ref inventory only, no claim of full implementation review |
| clan-sdk default `main`, `nuray/feature/client` | `f9cdc5cec9d32ebc463251fc910240f632137f07`; existing Social client baseline |
| clan-sdk working branch / origin `nuray/feature/widget` | `8dd6d5e9c19fd01f33d55f484482515102be107b`; fetched origin equals committed local HEAD; local uncommitted work retained |
| clan-frontend / demo-game | `ls-remote --symref … HEAD` and branch inventory succeeded but returned no refs; no default branch, commit, components or consumer code to inspect |

Access verification used `git remote -v`, `git ls-remote`, SDK fetch and an
isolated temporary bare backend clone including MR refs. The linked studio was
opened and its **Discover** player-facing panel inspected; no remote website
source/export or other screen implementation is claimed. The authentic attached
`clan-complete-ui` fixture (version changed to 1 as instructed) is the config
reference. There was no separately accessible screenshot attachment in this task.

**D-01 remains a dependency, not an incompatible implemented API.** Main and
develop `services/social/internal/handler/handler.go: Routes` and
`openapi/social.yaml` still expose only `/health` and `/ready`. Develop/MR !8
add player auth and players/clans/members migrations; a database schema is not
a response DTO. No actual list wrapper, emblem, capacity/availability fields,
join success DTO/status, or no-clan discriminator is implemented. Missing-route
404 remains an error, never an empty clan list or no-clan success.

Confirmed compatibility: `pkg/httpx` retains `{error:{code,message}}`.
Develop `auth.RequirePlayer` expects Bearer player JWT, `gid` game UUID, external
player `sub`; errors include missing_token, token_expired, wrong_token_type and
invalid_token. Existing Social callback/one-401-retry behavior is preserved,
tokens remain opaque and no player bootstrap or secret header was added.
Social CORS defaults to localhost:5174 (not 127.0.0.1:5175); the local demo is
same-origin mock traffic, not evidence that live CORS/token issuance works.
No WebSocket or published-config contract was found or used for this screen.

Resolution within SDK scope: additive `sdk.mountExperience` validates the
supplied Discover subset separately from minimal structural validation; its
controller uses the existing `listClans` and `joinClan`. A required synchronous
`clanAdapter` maps externally confirmed data into documented internal rendering
fields. There is **no default wire mapping or production mock**. Section
order/visibility/copy/theme, loading/search races, retry, join pending/error and
events, update/destroy and internal navigation are implemented. The absent
navigation boundary is now a small native `clan-sdk:navigate` / `clan-sdk:joined`
event boundary, not a claimed pre-existing public API. Create gets only a
missing-target handoff with Back, no screen component/form or Clan Home.

Options for the missing DTO: infer fields from SQL/design samples (fast but
risks incorrect IDs/capacity/join behavior); wait on all UI work (unnecessarily
blocks independent work); or build a replaceable renderer/controller with an
explicit adapter (recommended and implemented). Tradeoff: production automatic
DTO mapping remains blocked and the caller must currently supply an adapter.
Next steps: publish list/join OpenAPI with examples and statuses; confirm
emblems, counts/capacity and availability; implement/test the corresponding SDK
adapter; then verify real token/CORS/list/join behavior. Farida's Social T9–T14
brief supports the Social handoff; ownership of additional DTO/emblem decisions
is unconfirmed. No shared contract was changed by this implementation.

**CFG-06 remains a frontend dependency:** remote frontend has no shared UI.
The DOM renderer remains temporary behind `src/ui/experience-renderer.js` and
contains no HTTP/authentication. Frontend should supply framework/styles/props
before final replacement. Current internal view-model fields are not proposed
shared-component props. Other complete-experience screens, legacy design-proposal
adapter, backend config persistence, real Create navigation destination and chat
transport remain outside scope. Do not enforce permissions from JSON rules.

Git scope: committed SDK HEAD and origin/widget are identical, so no committed
branch divergence exists at that snapshot. This is **not** a merge test of the
dirty working tree, not proof of merging into main, and not a cross-repository
merge claim. No merge or push was performed for this task.

Verification: `npm test`: **138 passed, 0 failed**. `npm run test:browser`
initially hit an existing server on 5174; rerun with `BROWSER_TEST_PORT=5175`
started the existing harness. Final result: **52 passed, 0 failed**, including
all previous 41 tests and 11 Discover cases. Browser tests use recording fake fetch and explicit provisional
models. The Discover demo separately uses real HTTP against a development-only
provisional service and adapter; manual checks exercised load/full state,
server-rejected join, Create/Back and success events. No live backend integration
was run; implemented endpoints/DTOs and a running authorized service are missing.
`git diff --check` also passed (only normal LF/CRLF notices). New files are
listed in the README's Discover change inventory; previous uncommitted work was
preserved.
