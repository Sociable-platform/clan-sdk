# API

The friends API, the Social client API and the legacy API. Back to the [README](../README.md).

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

Search requires nonblank q (1–50 characters after server trimming), optional integer limit1–100, default100. The server excludes self/other games and returns relations `none`, `friend`, `request_sent`, `request_received`, `blocked`; pending relations include `requestId`. Caller-blocked search results offer Unblock. Players who blocked the caller are hidden by Social. DTO adapters remain internal to the SDK and never fabricate online presence. The Friends tab shows an online dot only for friends Realtime reports on: those with a DM conversation, from the conversation list and then live `presence.update` frames (offline about 10 s after their last tab closes). A friend without a DM shows no dot. Each friend also carries their clan (`clan: { id, name }` or `null`) from `GET /api/v1/friends`.

Initial loading requires `friends.enabled === true` and opening Friends. It uses shared `@clan/ui` rows, friend-management confirmation and Blocked section. SDK bindings add Add/Decline/Cancel controls to those existing rows; Remove friend and Block are available only through the shared name/avatar action menu, with no standalone Remove or Refresh friends button, without copying a screen or changing dashboard props. Search is debounced250ms; stale searches/loads and results after navigation or destroy are ignored. Blank input restores the friend list without sending an invalid empty search. Both request directions are displayed. Loading, empty, failure/Retry, pending and duplicate-click guards are explicit. Successful mutations refresh friends, requests, blocked players and an active search; there is no optimistic fake friendship. 404/409 conflicts refetch while keeping the server's action error visible, without retrying the mutation. Other errors retain status/code/message through ApiError, including self, duplicate, already-friends, unavailable player and sender/receiver permission errors.

Select a friend, choose **Block**, and confirm using the published UI's controls.
Blocking removes friendship and pending requests in either direction. The SDK
reloads all three collections and their counts. Whenever a friendship ends, by
**Remove friend** or **Block**, from either side, the DM is **kept, read-only**
for both players (TEAM-284; Realtime keeps it, TEAM-283): it stays in the Chat
list and opens with its history, but its message box is disabled with "You can
only message friends." (the same for both players, however it ended), and it
shows no online dot. Nobody is told who ended it. The
**Blocked** section loads actual Social players and its **Unblock** button removes
only the caller's block. Unblock does not restore friendship or requests, so the
DM stays read-only; after a new accepted friend request the same conversation
becomes writable again, with its history.
Clan chat follows its existing membership rules. Pending mutations disable
actions; realtime refreshes cannot release the duplicate-request guard.

The widget also exposes `await widget.refreshFriends()` (after `ready` for a Platform handle). It refreshes an enabled, open Friends view; otherwise it does no work. Reopening the tab and returning to the visible game also refresh enabled Friends state automatically. The public refresh method remains for host integrations and error Retry; the UI has no manual Refresh friends button. There is no polling. When live Realtime is enabled, friend notifications, conversation membership events and reconnect also refresh enabled Friends state in the background. Social's `player.blocked`/`player.unblocked` broker events are private and are not websocket notifications; `conversation.removed` revokes the remote DM. Real conversation presence comes from Realtime, never preview data.

TEAM-250 verification: **298 Node tests**, **97 browser regression tests against
built output with mocked services**, plus a separate live built-ESM browser check
with two disposable players against local Social/Realtime. Block/unblock,
reload persistence, both players' friendship/DM state, rejected messages in both
directions and explicit re-friending passed. That original run used SDK **0.1.1**
with published `@clan/ui` **0.1.30**; the current release is listed above. See
TEAM-250 results for contracts and the opt-in live command.

**Player-session changes:** keep token renewal bound to the same player. When your host switches accounts, first change the callback's current-player source and immediately call `sdk.resetPlayerSession()` in the same synchronous host operation (or destroy widgets and create a new SDK). Reset invalidates pending authenticated responses and token callbacks, destroys old UI state/drafts/controllers, and restarts each SDK-owned widget with the new callback. Widgets on another SDK instance are unaffected. No JWT is decoded and token rotation alone does not mean an account switch. To change games or service settings, create a new SDK with the new initialization options. A request already committed by Social cannot be undone; its old UI result is ignored.

```js
currentPlayer = nextPlayer; // your callback reads this host-owned source
sdk.resetPlayerSession();
```

Verification: **225 Node tests**, **70 real-browser mock tests**, and **8 live PASS groups** against local Social with two isolated dedicated test players (includes relationship cleanup). No FAIL/BLOCKED live operations in that run. This verifies the HTTP SDK against the running service, not its deployed SHA, browser CORS, Platform token exchange or websocket delivery. The Node-only runner used the existing local development signing key in memory and logged no tokens; dedicated player records remain, relationships were removed. See Friends report for exact source revisions, limitations and changed files.

Run mock tests with `npm test` and `npm run test:browser`. Live tests are **opt-in**, never part of npm test: `node test/live/friends.js --local-dev-key` requires an explicitly supplied `FRIENDS_LIVE_DEV_KEY` external development signing-key path. Alternatively provide `FRIENDS_LIVE_SOCIAL_URL`, `FRIENDS_LIVE_DEDICATED=1`, `FRIENDS_LIVE_TOKEN_A/B` as environment variables for two dedicated players whose external IDs start with `sdk-friends-test-`; run without the flag. The opt-in live Chat fixture requires `LIVE_CHAT_DEV_KEY` and running development services. No backend checkout or development key is needed for SDK installation, normal tests or preview. Tokens and keys are never printed. Do not use real player accounts for this relationship lifecycle test.

Host events bubble from the widget: `clan-sdk:navigate` (`screen`, `previousScreen`), `clan-sdk:tab` (`tab`), `clan-sdk:joined`/`created` (`clanId`). The SDK performs the confirmed actions itself.

### Unread messages and friend requests

The widget shows what is new (counts on the Friends and Chat tabs, a dot on the Clan tab, bold unread conversations, a "New messages" line) from Realtime's own read positions: `unread` of each conversation in `GET /api/v1/conversations`, one more for each `message.new` from another player while that conversation is not on screen, and `conversation.read` when it is. Read positions live on the server, so they survive reloads and other devices (other open tabs of the same player are not told until they reload the list).

For the game's own open/close button, the widget sends `clan-sdk:unread` whenever the numbers change, including when they drop to 0:

```js
container.addEventListener('clan-sdk:unread', event => {
  const { total, requests, clan, direct } = event.detail; // direct: { [friendId]: count }
  openClansButton.dataset.badge = total > 0 ? (total > 9 ? '9+' : String(total)) : '';
});
```

The Chat tab's count adds up unread direct messages on every tab, including the Clan tab before Friends has been opened. `requests` counts friend requests the player received (known once Friends has loaded, after a live `friend_request` notification or when the browser tab comes back to the front). To keep counting while the panel is closed, keep the widget mounted and hide its container (for example `hidden` or `display: none`) instead of destroying it: nothing is marked read while the container is hidden or the browser tab is in the background, and what is on screen is read as soon as the container is shown again.

Opt-in live check against local Social and Realtime (two disposable players, the built ESM in Chrome): `npm run build`, then `LIVE_UNREAD_GAME_ID=<game id> LIVE_UNREAD_DEV_KEY=<external development signing-key path> node test/live/unread.mjs`. It serves its page on `http://localhost:5174` (that origin must be in both services' CORS lists; Chrome is pointed at 127.0.0.1, so a dev server on `[::1]:5174` may keep running). It checks the badge, the event, reads on open, nothing read while hidden, and the server read position after a reload, then removes the friendship. Keys and tokens are never printed.

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
