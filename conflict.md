# SDK compatibility review and S-03 decisions

Review date: 2026-11-06. Task: S-03 from `team-81-complete-sdk-guide.md`, minimal widget mount/update/destroy lifecycle. This report separates implemented code, planned contracts, unfinished dependencies and confirmed discrepancies. No other team's source, remote branch, shared contract or Jira issue was changed.

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
