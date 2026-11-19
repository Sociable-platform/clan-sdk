# Features

Live chat, clan chat, leaving a clan, closed clans and join requests, and clan member management. Back to the [README](../README.md).

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

See live chat integration for inspected revisions,
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

Verification and changed files: TEAM-214 report.

## Closed clans: ask to join, leaders answer

A clan is `open` (anyone joins) or `closed`: a player of a closed clan is accepted by the clan's leaders (its owner, and any role
with `canKick` in the game's `clan.roles`). Social decides who may; clans made before this are open.

```js
await sdk.createClan({ name, joinPolicy: 'closed' });  // 'open' when left out
await sdk.requestClanJoin(clanId);                     // 201 {id, playerId, displayName, createdAt}
await sdk.cancelClanJoinRequest(clanId);               // 204: the caller takes their request back
await sdk.listClanJoinRequests(clanId);                // 200 {requests: [{id, playerId, displayName, createdAt}]}, leaders only
await sdk.acceptClanJoinRequest(clanId, requestId);    // 204: the player becomes a member
await sdk.declineClanJoinRequest(clanId, requestId);   // 204: they may ask again
await sdk.setClanJoinPolicy(clanId, 'open');           // 200 clan, owner only
```

The clan list (`GET /api/v1/clans`) gives each clan a `joinPolicy`, and `requested: true` on the clans the caller asked. Errors
keep status, code and message: 403 `clan_closed` (joining a closed clan directly), 403 `not_allowed`, 404 `request_not_found`, 409
`clan_open`, `already_requested`, `too_many_requests` (5 pending per player), `clan_requests_full` (50 per clan), `clan_full`,
`already_in_clan`.

**The mounted panel.** `join(clanId)` on a closed clan sends a request instead, and the clan stays in the list as `requested` until
a leader decides; a click on it takes the request back. An answer that says what changed fixes the mark instead of failing the
player: `already_requested` marks the clan, `request_not_found` clears it, `clan_open` or `clan_full` read the list again. A leader of
a closed clan gets the pending requests as `joinRequests` (`{id, playerId, name, at}`), and answers them one at a time; a member whose
role may not decide gets a 403 once and is not asked again for that clan and role. The owner opens and closes the clan with
`setJoinPolicy`; opening drops the list (players join directly now).

Realtime keeps it live: `clan_join_request` re-reads the leaders' requests, and `clan_join_declined` re-reads the player's clan list.
Events: `clan-sdk:join-requested` `{clanId}`, `clan-sdk:join-request-accepted` and `clan-sdk:join-request-declined`
`{clanId,playerId,requestId}`, `clan-sdk:join-declined` `{clanId}` (the player's own request was declined) and
`clan-sdk:join-policy-changed` `{clanId,joinPolicy}`. A host that does not know closed clans (an older SDK with a newer Social) sees a
403 `clan_closed` on Join, with Social's own message.

## Clan member management (TEAM-257)

```js
await sdk.promoteClanMember(clanId, playerId); // 200 {playerId, displayName, role}
await sdk.demoteClanMember(clanId, playerId);  // 200 {playerId, displayName, role}
await sdk.kickClanMember(clanId, playerId);    // 204 → undefined
```

Bodyless `POST /api/v1/clans/{clanId}/members/{playerId}/promote|demote` and
`DELETE /api/v1/clans/{clanId}/members/{playerId}`, Bearer player auth with the
existing one-401 fresh-token retry. Both IDs are encoded; empty/dot IDs throw
before any request. Errors retain status/code/message: 400 `cannot_kick_self`,
403 `not_allowed`, 404 `clan_not_found`/`member_not_found`, 409
`already_lowest_role`. No automatic retry.

Social decides by the game's `clan.roles` (`canPromote`, `canKick`; the owner has
every power). Promote/demote move one step; nobody is promoted to their own role
or to owner. Without published roles only Kick exists (owner only) and promote
answers 403. The shared Members panel offers only what the viewer's role allows,
and the SDK maps its `setRole(target)` to the one Social step (a target that is
not exactly one step away is ignored).

The mounted panel shows Promoting/Demoting/Removing member…, allows one member
action at a time, changes the roster only after a confirmed response, then
re-reads members and `myClan`. Server rejections show their text and re-read
state; network failures keep the last confirmed roster. Late responses after
leave/kick/session reset/destroy are ignored. Events: `clan-sdk:member-role-changed`
`{clanId,playerId,role}` and `clan-sdk:member-kicked` `{clanId,playerId}`.

The kicked player receives Realtime `clan_kicked` and `conversation.removed`; an
open widget returns to Discover and drops the clan room. Remaining members get no
frame for role changes or kicks, so opening Members re-reads the roster and own
role; no polling is added.

The member panel's Add friend / Cancel use the Friends API (`sendFriendRequest`,
`cancelFriendRequest`). Opening Members loads Friends state (when Friends is
enabled) so each member shows its real relation; a member who already sent a
request is accepted by sending one back, per Social.

Verification and changed files: TEAM-257 report.

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

Current results and live blockers: TEAM-226 report.
