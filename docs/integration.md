# Integrating a game

Adding the SDK to a game page, and the player-token callback the game provides. Back to the [README](../README.md).

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
under [Docker asset server](deployment.md#docker-asset-server) is not offered to games yet.

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

## Player token callback and coordination

The SDK calls `getPlayerToken({forceRefresh:false})` for normal Social acquisition,
and `getPlayerToken({forceRefresh:true})` after the first HTTP401. Existing zero-argument
callbacks remain compatible. All Friends reads remain distinct HTTP requests.
Normal concurrent acquisition and forced refresh share per-SDK in-flight work.
Requests whose old401 arrives after that refresh finishes reuse its result;
each HTTP operation still has at most two attempts and retains method/body.
Token callback failures do not send unauthenticated requests. Session reset drops
pending acquisition references and rejects previous-session responses/callbacks.

A suspended game is not served. When Social answers 403 `game_suspended`, or `getPlayerToken`
rejects with an error whose `code` is `game_suspended` (a game backend should pass Platform's
403 on that way), the widget shows the error message, offers no Retry, and turns search and
"Create a clan" off, because nothing the player does can fix it. Any other token failure keeps
Retry.

Expiry caching belongs to the game. Harvest Village now keeps its token only in
browser memory, using the game backend's `expiresIn` (seconds) / `expiresAt`
(epoch milliseconds). On the next use within30seconds of expiry (or10% for short
TTLs), it refreshes; there is no background polling or token persistence. A forced
refresh bypasses that cache and supersedes older pending acquisition. Auth
transitions clear the cache at both boundaries and block acquisition in between.
See token optimization report for game integration,
source selection and actual test/build results.
