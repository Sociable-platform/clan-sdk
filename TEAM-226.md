# TEAM-226 — realtime clan chat

Date:2026-11-14. Source: actual game-imported SDK at
C:/Users/Nicat/Desktop/clan-sdk/clan-sdk. Selected Documents/ChatGPT/sdk contains
only .git; temporary write permission was granted for the actual SDK directory.

## Contracts inspected

Fetched backend origin/develop@07878d6cfc3f7a1c0f42fe97fd575cf340df90b4.
Read openapi/realtime-ws.md, openapi/realtime.yaml, Realtime consumer membership
and suspension handlers, service/handler contracts. Source inspection is not a
claim about a deployed SHA. Installed @clan/ui0.1.1 public export, shared thread/
composer/chatTab/render input/action handling were inspected read-only.

Confirmed: HTTP Bearer GET /api/v1/conversations returns conversations with id,
kind, clanId and members. GET /api/v1/conversations/{conversationId}/messages
returns newest-first messages/hasMore, limit1–100, before as message-ID cursor.
Nonmembers get403 not_member. WS /api/v1/ws?token=... sends hello first, then
SDK may send application frames. IDs are Social UUIDs, not external game IDs.
Message send uses unique per-connection client correlation id and actual room
UUID; ACK/errors use data.replyTo. message.new contains final stored/filter text.
Read markers name an actual message from the selected visible room. No URL token
or frame body is logged. Backend enforces membership, blocks and published rules.

Clan events are built in this source: added/removed rooms; clan_joined (other
member joined), clan_kicked and clan_disbanded notifications. Unknown kinds are
ignored. presence.update is friend-only; clan room online fields are snapshots.
4403 game_suspended is built: no hello may precede it, remove panel and stop.
4003 and the five-connections-per-player limit remain marked not built; no verified
behavior is claimed for them. Code handles reserved4003 defensively without retry.

## Existing work reused / changes

Existing token coordinator, HTTP helper/client, real room-ID mapping, hello/list/
history, ACK/new dedupe, pending sends, errors, pagination/catchup and shared
visual components were reused. Added only the gaps:

- Membership notifications and idempotent added/removed handling; Social refresh
  or invalidation updates the shared screen. Room generations, tombstones and
  membership confirmation prevent late history/list/event resurrection while
  preserving DMs. Rejoin is confirmed through Social; no fake room or endpoint.
- Draft ownership tracking clears removed/disabled-room drafts even when the
  composer was absent. Transient reconnects preserve drafts. The installed shared
  input hook is reused; no node_modules edit or second renderer.
- 4403 destroys both direct and Platform-mounted widget lifecycles, subscriptions,
  visibility handler, timers and socket; pending config cannot remount it.4001
  uses shared forced token acquisition. Backoff1–30s plus jitter,1008 waits30s.
- Read markers are visible/selected-only and deduplicated; friend presence does
  not update clan snapshots. History errors wait for user retry/refresh rather
  than triggering a render-driven request loop. Server errors retain drafts;
  bad_frame logs only a static diagnostic. Published capability updates may
  release feature_disabled; backend remains the permission authority.
- Config loader keeps publication revision in internal metadata without changing
  successful JSON or conflating it with schemaVersion. ETag304 retains revision.
  Initial fallback is preserved; mounted refresh failure rejects/retains previous
  valid config/draft. Notifications coalesce within a handle, use0–500ms jitter,
  compare hello.configVersion to publication revision, and clean up on teardown.

No new initialization option or public API change. Minimal settings remain
socialUrl, realtimeUrl, getPlayerToken, and gameId/platformUrl for publication.
Current JSON flags clan.enabled/chat.enabled/chat.clanChat must permit clan chat.
No Harvest changes, package upgrade, secret key, backend contract change or push.

## Verification

- npm test:285 passed,0 failed. Includes focused clan selection, history/live race,
  ACK/new dedupe, removal/rejoin, known/unknown notifications, presence/read markers,
  expiry/backoff,4403, all documented send errors, capability recovery and revision
  metadata tests. The nonmember403 test is mocked, not server enforcement proof.
- Existing browser script/harness:89 passed,0 failed, including shared clan Home,
  safe final text, failed-send draft retention, removed clan composer/DM preservation,
  capability updates, suspension, revision comparison/coalescing and failed refresh.
  All HTTP/WS in these assertions are explicit mocks; the installed UI is real.
- git diff --check passed. SDK has no build script; no CDN/bundle task added.
- LIVE BLOCKED: configured http://localhost:8082/ready and :8083/ready were
  unreachable; docker ps returned no running containers. No multiplayer record
  was created and no live message/history/leave/kick/outsider access claim made.
  Earlier live runs from other tasks do not count as TEAM-226 verification.

Unverified live checks: two players in same clan, bidirectional messages, persisted
history after reload, reconnect catchup, leave/kick revocation and unrelated-player
403 denial. These require the current Social/Realtime/queue/database services and
valid dedicated player tokens. Exact-origin CORS must include the page origin;
public game settings inspected still target8082/8083. No infrastructure was started
or configuration weakened as a substitute for available-backend verification.

No current @clan/ui blocker. Formal async status/draft APIs would eventually
replace the existing tested DOM/input bridge; selector compatibility remains tied
to installed0.1.1 and should be tested when upgrading. No live clan presence,
undocumented replay, automatic resend or other not-built protocol feature claimed.

## Files changed for TEAM-226

src/chat/controller.js; src/config/platform.js;
src/experience/shared-controller.js; src/ui/experience-widget.js;
src/ui/platform-experience.js; src/ui/shared-renderer.js; src/ui/chat-controls.js;
test/clan-chat.test.js (new); test/config-revision.test.js (new);
test/browser/clan-chat-tests.js (new); test/browser/platform-config-tests.js;
test/browser/widget-tests.js; package.json; README.md; this report.

Existing uncommitted src/ui/friends-controls.js and test/browser/friends-tests.js
were present at start and left untouched. Their tests remained part of the suite.
