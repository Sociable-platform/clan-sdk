# Development

Installing from the GitLab npm registry, building the two bundles, the tests and the local verification pages. Back to the [README](../README.md).

## Install and verify

Node 22 or newer. The `.npmrc` next to `package.json` contains exactly:

```ini
@clan:registry=https://gitlab.com/api/v4/groups/146782114/-/packages/npm/
//gitlab.com/api/v4/groups/146782114/-/packages/npm/:_authToken=${GITLAB_NPM_TOKEN}
```

Keep that placeholder literal. Set `GITLAB_NPM_TOKEN` in the environment of the
terminal running npm. Use a **read-only group deploy token** with
`read_package_registry` permission and access to the package. No publish/write
permission is needed. This installation credential is separate from the game's
secret API key and the player's runtime token; never put it in browser code,
configuration JSON, a `VITE_` variable or a committed file.

Windows PowerShell (masked local prompt, token used only by this shell):

```powershell
$registrySecret = Read-Host 'GitLab read-only deploy token' -AsSecureString
$env:GITLAB_NPM_TOKEN = [System.Net.NetworkCredential]::new('', $registrySecret).Password
npm ci
npm test
# When finished with npm in this shell:
Remove-Item Env:\GITLAB_NPM_TOKEN
Remove-Variable registrySecret
```

Other shells can export an existing secret environment variable before running:

```sh
npm ci
npm run build
npm test
npm run test:bundle
```

`npm ci` installs the exact version in `package-lock.json`; it does not select a
new release just because `^0.1.97` allows one. To adopt a newer compatible release:

```sh
npm update @clan/ui
npm test
npm run test:browser
```

Include the resulting changed `package-lock.json` with every dependency update.
Do not substitute `file:` links or copied repositories. The lockfile currently
resolves registry release **0.1.97**, which is bundled into both browser formats.
This renderer opens Chat on a conversation list; selecting a row opens its
message history. The SDK reads the open header's `data-conversation` hook to
route history, read receipts and sends to the correct Realtime conversation.
The Blocked section is hidden when empty. The current Create form has no tag
input; the low-level `createClan({tag})` option remains for existing integrations.
See migration results for clean-install verification.

`npm run build` is the canonical build command. It uses esbuild and produces
`dist/clan-sdk.js` (classic script/IIFE) and `dist/clan-sdk.esm.js` (ES module).
Each contains the published UI renderer and its Shadow DOM CSS. Both have a
version banner read from `package.json`; the same version is exposed as
`ClanSDK.version` or the ESM `version` export. All existing public exports remain
available. Each output must be **under 60,000 bytes gzip**; the build prints both
sizes and fails if either reaches that limit. No bundler, import map, React,
separate UI stylesheet, or source checkout is needed by the consuming game.
All formats load the configured curated heading/body fonts automatically from
Google Fonts, matching the dashboard preview. UI styles stay inside the bundle;
the font stylesheet and font files are fetched at runtime. If your game uses
CSP, allow `https://fonts.googleapis.com` in `style-src` and
`https://fonts.gstatic.com` in `font-src`. System fonts remain the fallback when
font delivery is unavailable.

`npm run test:bundle` requires a completed build. It launches headless Chromium
(or installed Chrome/Edge), starts the plain Node HTTP server on a temporary
port, and checks both built files on isolated HTML pages without import maps.
It checks API/version parity, a visible styled panel, token/service URL handling,
and rejects extra SDK code or UI stylesheet requests. Google font CSS is mocked
while its configured families and link lifecycle are checked. It then runs the existing
browser regression suite against the built ESM output. These are **bundle-loading
and regression tests with mocked Platform/Social/Realtime services**, not live
backend verification. Screenshots are written to `test/browser/artifacts/`.
If no browser is installed, run `npx playwright install chromium`; optionally set
`BROWSER_CHANNEL=chrome` or `msedge` to select an installed browser.
For an opt-in real Google Fonts delivery check, set `BUNDLE_LIVE_FONTS=1` when
running `npm run test:bundle` (PowerShell: `$env:BUNDLE_LIVE_FONTS='1'`). This
loads Bangers/Silkscreen font files in both formats and verifies loaded font
faces. Platform/Social/Realtime responses remain mocked in this mode.

`npm run test:browser` still serves the original source-mode tests at
http://127.0.0.1:5174/. It starts a server without launching a browser; open the
page to execute the assertions. Set `BROWSER_TEST_PORT` if necessary. Its import
map serves the installed UI package for development/comparison only. After a
build, the standalone pages are available at `/test/browser/bundle-iife.html`
and `/test/browser/bundle-esm.html` on the same plain HTTP server. No Vite server
is used. `src/index.js` remains the source/package entry point.

CI uses the committed `.gitlab-ci.yml` to run `npm ci`/`npm test`, then build and
publish the asset-server image. Configure `GITLAB_NPM_TOKEN` as a **masked secret
CI/CD variable**, using the read-only group deploy token above; protect it where
appropriate for branch policy. It must be available to any publishing job you
start. The Docker build receives it only through a BuildKit secret. Do not echo
it or enable shell tracing around credentials.

`npm test` uses Node's built-in runner and recording fake fetch. It never contacts a backend. Browser tests distinguish synthetic Social/Platform responses from the real HTTP request to the development-only config mock. Actual current results are in shared renderer notes.

## Local verification pages

Run `npm run preview` (same server as browser tests), then:

- [Shared UI comparison](http://127.0.0.1:5174/test/browser/shared-preview.html): left is direct `@clan/ui.render`, right is **public `sdk.mountExperience`**. Both receive the same current JSON and explicitly fabricated sample dataset. Change theme/feature/label JSON and Apply; select sample screen states; Destroy/Remount. All preview fixtures/actions live outside `src`. It is not the actual dashboard route or the demo game.
- [Manual-token live Social preview](http://localhost:5174/preview/discover/): edit Social URL, paste raw player token, Mount. Real failures never fall back to fake data; Retry reads the latest input token. Join/Create change real membership. Disconnect clears the in-memory token. No token is persisted/logged. Backend CORS must allow the page origin.
- `?mode=mock` explicitly opts that page into a development-only Social route prefix with fabricated data. This mock supports membership/list/join; other operations report unsupported.
- [Legacy remote Chat API preview](http://127.0.0.1:5174/preview/): bare legacy config HTTP mock and refresh; kept only for compatibility testing.

The earlier editor check redirected to login; authenticated-editor visual verification remains unavailable. The earlier272 frontend/shared-schema tests and comparison page verify the supplied shared UI subset. The later live chat verification and minimal Harvest connection-settings change are recorded separately below.
