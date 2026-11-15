# TEAM-257: clan member promote, demote, kick and member Add friend

SDK version: **0.1.1**, retained at the user's request. Published renderer:
**@clan/ui 0.1.30**, unchanged. Its Members screen already offers Promote,
Demote and Kick by the viewer's role (with its own kick confirmation) and Add
friend / Cancel in each member's panel, calling `data.actions.setRole`,
`kick`, `addFriend` and `cancelFriendRequest`. None of these were bound, and the
SDK renderer force-disabled the management buttons. No renderer fork is needed.

## Contracts inspected

Backend checkout HEAD: `51549774cea8892e9ff062818c117d7ecc582480`.
Inspected `openapi/social.yaml`, `openapi/realtime-ws.md`, `docs/event-messages.md`
and the Realtime dispatcher. The running Social answers 401 (not 404) on the new
routes; its image revision was not verified against this checkout.

| Operation | Contract |
| --- | --- |
| Kick | `DELETE /api/v1/clans/{clanID}/members/{playerID}`, no body, 204. 400 `cannot_kick_self`, 403 `not_allowed`, 404 `clan_not_found`/`member_not_found` |
| Promote | `POST …/members/{playerID}/promote`, no body, 200 `{playerId,displayName,role}`. 403, 404 |
| Demote | `POST …/members/{playerID}/demote`, no body, 200 `{playerId,displayName,role}`. 403, 404, 409 `already_lowest_role` |
| Permission | Game `clan.roles` `canPromote`/`canKick`; owner has every power; one step only, never to the caller's role or owner. Without published roles only the owner can kick and promote answers 403 |
| Realtime | Kicked player: `notification` `clan_kicked` + `conversation.removed` (already handled). `clan.member_role_changed` is dropped by Realtime; remaining members get no frame for kicks either |
| Add friend | `POST /api/v1/friends/requests {playerId}`: 201 request, or 200 friend when that player had already asked (accept by sending back) |

## Behaviour

- Public low-level methods `kickClanMember`, `promoteClanMember`,
  `demoteClanMember(clanId, playerId)` share the existing request helper.
- The renderer's `setRole(memberId, targetRole)` is mapped to one Social step
  using the same `clan.roles` order as @clan/ui (`src/config/roles.js`; the
  renderer does not export its helper). Any other target is ignored.
- One member action at a time with Promoting/Demoting/Removing member… status;
  the roster changes only after a confirmed response, then members and `myClan`
  are re-read. Server rejections show their text and re-read state; network
  failures keep the last confirmed roster. Leave/kick/session reset/destroy
  invalidate late responses. Events `clan-sdk:member-role-changed` and
  `clan-sdk:member-kicked`.
- Opening Members re-reads `myClan` with the roster, so a role changed by
  someone else (no realtime frame) is not shown stale. No polling.
- **Add friend bug:** the panel actions were unbound, and Friends state only
  loaded and accepted actions on the Friends tab. Friends is now also active on
  the Members screen; members carry their real relation/request ID; `send` is
  allowed for confirmed roster members who are not self, friends, blocked or
  already requested.

## Verification

- `npm test`: **322 passed**, including 18 focused tests in
  `test/clan-manage.test.js` (wire formats, encoding, 401 retry, each error code,
  role-step mapping, pending/duplicate guards, rejection vs network handling,
  stale responses, member Add friend eligibility).
- `npm run build`: `dist/clan-sdk.js` **40,226 bytes gzip**,
  `dist/clan-sdk.esm.js` **40,014 bytes gzip**, both under 60,000 bytes.
- `npm run test:bundle`: **104 browser cases passed**, including six new ones in
  `test/browser/clan-manage-tests.js` (promote/demote pill, kick confirmation
  and single DELETE, member sees no management, rejection text, Add friend →
  Cancel → Add friend, destroy during pending kick). Mocked services.
  Two existing Discover assertions that forbade any `/players/me` read on Members
  were narrowed to "no non-GET bootstrap", since Members now loads Friends state.
- `test/live/clan-manage.mjs` (real services, three disposable players) was
  written but **not run**: it needs an external development signing key and game
  ID. Promote/demote are reported SKIP when the game has no published roles.

```powershell
$env:LIVE_CLAN_DEV_KEY = '<external development signing-key path>'
$env:LIVE_CLAN_GAME_ID = '<configured development game UUID>'
npm run build; node test/live/clan-manage.mjs
```

Optional: `LIVE_CLAN_SOCIAL_URL`, `LIVE_CLAN_REALTIME_URL`, `LIVE_CLAN_PORT`
(default 5174, must be allowed by CORS), `BROWSER_CHANNEL`. Cleanup leaves the
test clan (Social deletes it when empty) and cancels requests; no accounts deleted.

## Known limits / follow-ups

- With Friends disabled and no `realtimeUrl`, the viewer's Social ID is unknown,
  so the panel cannot find the viewer and offers no management.
- With Friends disabled, @clan/ui still draws Add friend; the SDK does not send
  it. Renderer follow-up: hide the friend offer when `friends.enabled` is false.
- Role helper duplication: ask @clan/ui to export `normalizeRoles`/`roleIndex`.

## Changed files

- Client/API: `src/social/client.js`, `src/social/clan-adapter.js`, `src/index.js`,
  `src/config/roles.js` (new).
- State/UI: `src/experience/shared-controller.js`, `src/friends/controller.js`,
  `src/ui/experience-widget.js`, `src/ui/shared-renderer.js`.
- Tests: `test/clan-manage.test.js`, `test/browser/clan-manage-tests.js`,
  `test/live/clan-manage.mjs` (new); `test/browser/widget-tests.js`,
  `test/browser/discover-tests.js`.
- Docs/scripts: `README.md`, `package.json` (test list), `TEAM-257.md`.
