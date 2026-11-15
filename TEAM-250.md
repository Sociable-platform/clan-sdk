# TEAM-250: block and unblock friends

SDK version: **0.1.1**, retained at the user's request. Published renderer:
**@clan/ui 0.1.30**, unchanged in both
the manifest range (`^0.1.30`) and resolved lockfile package. Its existing
`data.actions.blockFriend(id)` and `data.actions.unblock(id)` hooks, management
confirmation and Blocked list supply the UI; no renderer fork is needed.

## Contracts inspected

Backend checkout HEAD: `07878d6cfc3f7a1c0f42fe97fd575cf340df90b4`.
Inspected `openapi/social.yaml`, Social block handlers/services/repository,
`openapi/realtime-ws.md`, and Realtime broker consumer/event/dispatch handlers.
The running services were exercised separately; their image revision was not
verified against this checkout.

| Operation | Contract |
| --- | --- |
| Load blocks | `GET /api/v1/players/me/blocks`, 200 `{blocks:[{id,displayName,since}]}` |
| Block | `POST /api/v1/players/{playerID}/block`, no body, 204; idempotent |
| Unblock | `DELETE /api/v1/players/{playerID}/block`, no body, 204; idempotent |
| Identity/auth | Target is a Social UUID; caller/game come from the current player-token callback, using the existing HTTP helper and token retry/session guards |
| Friendship | Block atomically removes friendship and pending requests in both directions. Unblock removes only the caller's block; it restores no friendship or request |
| Search | Caller-blocked targets return `relation: blocked`; targets who blocked the caller are hidden |
| Realtime | Private broker `player.blocked`/`player.unblocked` events have no public websocket frame. Friendship removal revokes both DM memberships and emits `conversation.removed`. Sending while blocked is rejected; clan membership/chat is unchanged |
| Re-friending | After unblock and a new accepted request, `conversation.added` restores the existing DM/history |

Friends, requests, blocks and their counts are read back after mutation success.
Pending operations remain guarded across realtime refresh/tab navigation.
Readable failures retain the last confirmed collections; conflict responses
trigger a refetch. Block removes the local DM immediately after acknowledgement,
invalidates late history/list results and discards its draft/pending send. Own
blocked IDs also reject stale room events. Reconnect refreshes enabled Friends
state even while Chat is visible. Hosts must call `sdk.resetPlayerSession()` on
logout/player changes, as documented in the README; old controllers/responses
cannot write into the replacement widget.

## Verification

- `npm test`: **298 passed**, including 10 focused block tests covering HTTP
  contracts/errors, authoritative collections/counts, duplicate requests during
  refresh, tab navigation, destruction/session reset and late DM history.
- `npm run build`: successful; `dist/clan-sdk.js` **38,353 bytes gzip**,
  `dist/clan-sdk.esm.js` **38,154 bytes gzip**, both under 60,000 bytes.
- `npm run test:bundle`: isolated classic IIFE and direct browser ESM imports,
  version/API parity, styled panel, no source/external code or stylesheet fetches;
  **97 browser regression cases passed**, including seven block-related cases.
  These use mocked services and verify bundle loading/UI integration.
- `node test/live/block.mjs`: **eight PASS groups** against running local
  Social `localhost:8082` and Realtime `localhost:8083`, with two new disposable
  players in an explicitly selected development game. Plain HTTP at
  `localhost:5174` served only the built ESM SDK and a small host page/token
  endpoint. The published panel rendered and delivered a real websocket DM.
  Shared Block updated both friend lists and removed the recipient's open DM;
  the blocked list/count persisted after browser reload; raw websocket sends
  were rejected in both directions. Shared Unblock persisted after reload and
  restored neither friendship nor DM. Explicit re-friending recovered the same
  conversation/history. Only the test pair's relationships were cleaned up;
  no player records, accounts or progress were deleted.

Repeat the live check only with local development services and an explicit
development signing key, never a production key. Build first. PowerShell:

```powershell
$env:LIVE_BLOCK_DEV_KEY = '<external development signing-key path>'
$env:LIVE_BLOCK_GAME_ID = '<configured development game UUID>'
node test/live/block.mjs
```

Optional variables: `LIVE_BLOCK_SOCIAL_URL`, `LIVE_BLOCK_REALTIME_URL`,
`LIVE_BLOCK_PORT` (default 5174, must be allowed by service CORS),
`BROWSER_CHANNEL` (default chrome). Tokens stay in memory/no-store responses and
are not logged. This check uses development-signed tokens rather than testing
Platform's game-server token exchange. It does not verify deployed services,
GitLab CI, image publication or an updated nginx/container deployment. No push,
publication or deployment was performed. No TEAM-250 implementation blockers
remain with the tested services.

## Changed files

- Public client/DTOs: `src/index.js`, `src/social/friends.js`,
  `src/social/friends-adapter.js`.
- State/UI integration: `src/friends/controller.js`, `src/chat/controller.js`,
  `src/ui/experience-widget.js`, `src/ui/friends-controls.js`.
- Focused tests: `test/block.test.js`, `test/browser/block-tests.js`,
  `test/live/block.mjs`.
- Existing test integration/fixtures: `test/friends-client.test.js`,
  `test/friends-controller.test.js`, `test/browser/friends-tests.js`,
  `test/browser/widget-tests.js`.
- Version/test command/docs: `package.json`, `package-lock.json`, `README.md`,
  `TEAM-250.md`. Generated `dist/` remains ignored and is rebuilt by the
  canonical `npm run build` command.
