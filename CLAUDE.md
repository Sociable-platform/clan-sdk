# clan-sdk

The script a game loads to get Sociable's clans, friends and live chat: plain JavaScript ES modules, built with esbuild into `dist/clan-sdk.js` (script tag, `window.ClanSDK`) and `dist/clan-sdk.esm.js`. Read `README.md` first; the reference is in `docs/` (integration, configuration and lifecycle, API, features, development, deployment).

The backend is `../clan-backend` (Platform 8081, Social 8082, Realtime 8083; contracts in its `openapi/`), Studio and the widget renderer `@clan/ui` are in `../clan-frontend` (`packages/ui`), the example game is `../demo-game`.

## Rules

1. **The widget's markup and styles live in `@clan/ui`, not here.** The SDK passes the published config to the renderer and wires data and actions to it. A UI change goes into `clan-frontend/packages/ui`, is published from its `develop`, and is picked up here with `npm update @clan/ui` plus the changed `package-lock.json`. Never copy renderer code or CSS into this repo, never use `file:` links.
2. **The game needs nothing but a script tag:** no React, no bundler, no import map, no separate stylesheet.
3. **Each bundle stays under 60,000 bytes gzip.** The build prints both sizes and fails at the limit.
4. **Keep the public API.** Every existing export of `ClanSDK` / the ESM build stays available; new options are additive. Document a change in `docs/api.md` or `docs/configuration.md` in the same MR.
5. **Tokens:** the game's API key never reaches the browser. The SDK only gets player tokens through the game's `getPlayerToken({ forceRefresh })` callback and retries once with `forceRefresh: true` on a 401.
6. The SDK depends on documented `.sk-*` / `data-key` hooks in `@clan/ui`; a change to those hooks needs a matching change here.

## Install and checks

`@clan/ui` comes from the GitLab npm registry. `GITLAB_NPM_TOKEN` (a read-only deploy token) is set only in the shell (`Read-Host -AsSecureString` in PowerShell), never in a file, `.npmrc` value, `VITE_` variable or log. Node 22 or newer.

```bash
npm ci
npm run build          # both bundles
npm test               # Node test runner with a recording fake fetch, no backend
npm run test:bundle    # needs the build; headless Chromium against the built files
```

`npm run test:browser` serves the source-mode browser tests at http://127.0.0.1:5174/. Browser tests use mocked Platform, Social and Realtime responses: they are not live verification, so do not claim live results from them.

## Deploy

**Every merge to `main` is deployed**: CI tests, builds the asset-server image and runs `deploy/deploy.sh`. `/v1/` on `sdk.<host>` always serves the newest release, uncached, so a bad release reaches every game on its next page load. `develop` only tests and builds. Details: `docs/deployment.md`.

## Git conventions

- **Branches:** `<category>/<JIRA-ID>-<short-description>`; category lowercase (`feat fix hotfix refactor test docs ci chore release`), Jira ID uppercase (this project: `TEAM-nn`), description lowercase hyphenated 2-4 words. `chore`/`release` need no ticket ID.
- **Long-lived:** `main` and `develop`, both protected. Never push to them; branch from the latest `develop`, one feature or fix per branch, MR into `develop`, delete the branch after merge. `develop` is merged into `main` for a release.
- **Commits:** Conventional Commits, `type(scope): subject`, imperative present tense, no trailing period, first line <= 72 chars; add the ticket, e.g. `fix(chat): keep the draft after a failed send (TEAM-123)`.
- **MRs:** title in commit format; small and focused; draft for WIP. Description: `## Summary`, `## Changes`, `## Type` (Feature / Bug fix / Refactor / Documentation / CI), `## Notes (optional)`.
- **Review:** share the link in the group chat; teammates react; the author resolves discussions; the Team Lead gives the only formal approval; the author merges into `develop`. Prefix feedback `blocking:` / `suggestion:`.
- Never commit secrets (`.env`, keys, tokens, `*.pem`) or broken code. Resolve conflicts locally.

## Jira conventions

- BA writes User Stories; FE/BE create sub-tasks under the story; QA creates `[QA] <story title> Testing` and logs bugs as its sub-tasks.
- Titles: `[FE]`/`[BE]` + imperative verb + what + context; bugs: `[FE]`/`[BE]` + what is broken. Sentence case, <= 80 chars, no trailing punctuation.
- Description before IN PROGRESS: `## What to deliver` (2-3 sentences) and `## Done when` (testable checkboxes).
- Status: `BLOCKED -> TO DO -> IN PROGRESS -> RESOLVED (ON REVIEW) -> QA REVIEW -> DONE`, with a comment on every change (In Progress -> Resolved: `MR opened. / MR: <link> / Branch: <name> / What changed: <one sentence>`).
