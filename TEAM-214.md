# TEAM-214 — Leave clan integration

Inspected/fetched backend origin/develop@01194fb56ae98413b909b1da0090714cd557244c.
Evidence: openapi/social.yaml leaveClan; services/social/internal/handler/clans.go
leaveClan; service/clans.go LeaveClan; repository/clans.go LeaveClan; shared
@clan/ui0.1.1 render.js actions.leave and existing leaveConfirm component.

Contract: bodyless POST /api/v1/clans/{clanID}/leave; player Bearer authentication;
204 empty. Invalid/missing/other-game clan404 clan_not_found; nonmember409
not_in_clan; origin403 origin_not_allowed; auth401 uses existing refresh once.
Owner is allowed: ownership moves to earliest member (ID tiebreak); sole owner
leaving deletes clan. No client role restriction or new backend endpoint.

Implementation reuses the shared confirmation/action, SDK HTTP/token/error
helper, generation guards, configured screen resolver and existing renderer.
Pending state suppresses duplicates. Confirmed success clears clan/role/members,
join/search state and old clan chat; then refetches Discover when active.
Navigation to unrelated tabs while pending is retained. Failed requests leave
membership intact. Late member/history/room-list/event results cannot restore
left clan; rejoining explicitly permits the room again. Per-room invalidation
preserves DM history, pending DM sends and the socket. Destroy/session reset
invalidates old controllers; no Harvest/shared package/backend source changed.

## Verification

- npm test:262 passed,0 failed (mock/unit tests, including new leave and DM-cleanup cases).
- Existing real-browser harness:81 passed,0 failed, including shared confirmation,
  pending, failed leave, detached actions and teardown. HTTP/WS fixtures are mocks.
- LIVE local Social: dedicated owner created isolated clan; dedicated member
  joined via SDK; mounted actual SDK at allowed localhost:5174 origin; Leave
  confirmation completed; Discover showed1/10 and Join; reloaded page still
  showed Player · no clan and Discover. PASS. No mock responses in this run.
- Local dev signing key stayed in the Node-only opt-in fixture; no token/key was
  logged or persisted in browser storage. Platform token exchange and exact
  running-service SHA are not verified by this test.
- Live clan chat removal, owner transfer and expiry/retry failures were not tested
  through browser; SDK chat cleanup/error paths have mock coverage. Current fetched
  Realtime source now implements ClanMemberLeft/ClanDisbanded handlers in
  consumer/dispatch.go, superseding older missing-handler notes. Deployment of
  those handlers and actual permission synchronization remain a live-verification
  dependency. SDK ignores old clan data but cannot grant/revoke server permission.

The development verification page lives at test/browser/live-leave.html; opt-in
server uses LIVE_LEAVE_TEST=1 and LIVE_LEAVE_DEV_KEY pointing to an external local
backend development key. It creates dedicated test records and uses real HTTP.
For origin restrictions, existing Vite served the SDK page under its allowed
/@fs/ root and tokenBase referenced the loopback fixture server. No game edits
or backend CORS changes. No registry dependency/version changes, push or Jira edits.

## Files

src/index.js, src/social/client.js, src/experience/{shared-controller,discover-controller}.js,
src/ui/{experience-widget,shared-renderer,chat-controls}.js, src/chat/controller.js,
test/leave.test.js, test/chat-live.test.js, test/browser/leave-tests.js,
test/browser/widget-tests.js, test/browser/server.js, test/live/leave-fixture.js,
test/browser/live-leave.{html,js}, package.json, README.md and this report.

Cleanup: the member's persisted myClan404 not_in_clan was also verified via real
HTTP. The known dedicated clan was then checked to contain only its dedicated
owner, and that owner left (204), deleting only the test clan. Player records
were retained. Test servers were stopped; unrelated player data was untouched.
