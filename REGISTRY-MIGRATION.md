# GitLab UI dependency migration — 2026-11-13

Completed using registry **@clan/ui 0.1.1**. The earlier401 blocker was resolved when the user supplied GITLAB_NPM_TOKEN in the local .env file. It was loaded into npm's process environment without display. The credential file was not copied to the clean checkout and is now ignored. .npmrc retains the exact literal environment placeholder.

## Implementation

- package.json declares ^0.1.0. npm regenerated package-lock.json with registry version0.1.1 and integrity. Inspection found no credentials, file dependencies, links or copied-repository references.
- Installed public exports include render, createMockData, SCREENS, resolveScreen, FONT_FAMILIES, googleFontsHref, resolveTheme and buildLabels. SDK public APIs and production renderer code are unchanged.
- Preview server resolves the installed public export and its relative modules/assets. Five import maps use that route; no copied source layout, bundle/CDN task or dashboard checkout is needed.
- Opt-in live fixtures require explicit external development-key paths. Normal installation/tests/preview need no backend copy.
- README documents deploy tokens with read_package_registry permission, secure PowerShell setup, npm ci, npm update @clan/ui and including updated lockfiles.
- No CI installation pipeline was found. README documents a masked GITLAB_NPM_TOKEN CI variable. CI was not run and is not claimed passing.

## Preservation

The copied frontend was clean at b91b8bfd9c578e76a8ec544c8f4c7d321e4d6e8e. All463 files including Git metadata were copied and SHA256 verified before removal. Comparison against the independent frontend found zero copy-only/different source files.

Backup:
C:/Users/Nicat/.codex/visualizations/2026/11/06/01a1b001-8589-7cf2-a223-bc483cb4705f/clan-sdk-registry-migration-20261113/

This retains the full frontend copy, old local lockfile and preservation manifest. Earlier failure logs there are historical, before token availability. The local package junction and obsolete ignore entries were removed. No nested backend existed. Independent sibling repositories remain untouched.

## Final verification

| Check | Result |
| --- | --- |
| Working SDK npm ci | PASS, registry0.1.1 installed |
| Working SDK npm test | 251 passed,0 failed |
| SDK-only clean checkout npm ci | PASS, using registry lockfile without previous node_modules/copies |
| Clean checkout npm test | 251 passed,0 failed; credential removed from test process environment |
| Clean real-browser harness | 78 passed,0 failed on installed0.1.1 |
| Clean shared preview | Both panels render with matching background rgb(23,25,35), text rgb(244,244,249), embedded styles and three badges per panel; font/asset tests pass |
| Lockfile inspection | Correct version/integrity/GitLab host; no URL credentials/query, links or stale local paths |
| git diff --check | PASS |

Clean checkout:
C:/Users/Nicat/.codex/visualizations/2026/11/06/01a1b001-8589-7cf2-a223-bc483cb4705f/clan-sdk-registry-clean-20261113/

It contains no copied repositories or .env file. Preview data is explicitly mock data; no live Social/Realtime run is claimed. The temporary server was stopped after verification. No migration blocker remains. Nothing was pushed or published.

## Changed files

.npmrc (new), .gitignore, package.json, npm-generated package-lock.json, README.md, this report, test/browser/server.js, test/browser/ui-package.js (new), test/ui-package.test.js (new), test/browser/{index,live-chat,shared-preview}.html, preview/index.html, preview/discover/index.html, test/live/{friends,chat-fixture}.js. Removed the copied frontend directory; no backend copy existed.
