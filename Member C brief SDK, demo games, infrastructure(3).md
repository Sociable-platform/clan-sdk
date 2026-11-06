# Member C brief: SDK clan panel + demo game

Nov 6, 2026 · Nuray Muxtarli

> Task update — Nov 6, 2026. The attached `clan-platform-backlog (1)(1).csv` is the source for the current tasks, epic relationships and assignees. E1–E6 and T1–T25 are CSV identifiers, not Jira issue keys. The CSV supplies no dates, sprint assignments, story points or completion status, so these are not inferred. Checkboxes below are tracking placeholders.

## Scope

C owns the JavaScript SDK clan panel and one demo game with its own token-exchange server. Two players must be able to create and join the same clan and see its members. Infrastructure is assigned to Farida under E1.

5 tasks assigned to Nuray Muxtarli.

| CSV epic | Area | Assignee |
| --- | --- | --- |
| E5 | SDK clan panel (clan-sdk) | Nuray Muxtarli |
| E6 | Demo game | Nuray Muxtarli |

## Tasks from the CSV

Tasks are grouped by their CSV parent epic and retain the source order, titles, descriptions, labels and assignees.

### E5: SDK clan panel (clan-sdk)

Plain JavaScript library the game embeds: lets players see, create and join clans and see members. Talks to the social service.

#### T21: SDK: core client for the social service

- [ ] Complete T21

Assignee: Nuray Muxtarli · Parent: E5 · Label: `sdk`

Plain JavaScript client: init({ socialUrl, getPlayerToken }). Methods: listClans, createClan, joinClan, myClan, clanMembers.

**Acceptance criteria**

* Token from getPlayerToken() is sent as Bearer on every call
* On 401 the client asks for a new token once and retries
* API errors are returned with code and message
* No secret API key in the SDK

#### T22: SDK: clan panel, no-clan state (list, create, join)

- [ ] Complete T22

Assignee: Nuray Muxtarli · Parent: E5 · Label: `sdk`

Panel shown when the player has no clan: clan list with Join buttons and a Create clan form.

**Acceptance criteria**

* Full clans show Join disabled
* Create form validates the name and shows server errors
* After create or join the panel switches to the my-clan view
* Text rendered with textContent, never innerHTML

#### T23: SDK: clan panel, my clan and members

- [ ] Complete T23

Assignee: Nuray Muxtarli · Parent: E5 · Label: `sdk`

Panel shown when the player is in a clan: clan name, role and members.

**Acceptance criteria**

* Shows clan name and the player's role
* Members list marks the current player
* Refresh button or polling updates the list

### E6: Demo game

Small web game that uses the SDK clan panel, with its own tiny server that holds the API key.

#### T24: Demo game: own server with login and player token

- [ ] Complete T24

Assignee: Nuray Muxtarli · Parent: E6 · Label: `demo-game`

Tiny server for the demo game: nickname login and an endpoint that calls platform POST /api/v1/players/auth with the API key and returns the player token.

**Acceptance criteria**

* API key read from an environment variable on the game server only
* Browser receives only the player token
* .env.example documents the variables

#### T25: Demo game: embed the SDK clan panel

- [ ] Complete T25

Assignee: Nuray Muxtarli · Parent: E6 · Label: `demo-game`

Add the clan panel to the game page so players can see, create and join clans and see members.

**Acceptance criteria**

* Two tabs as two players: one creates a clan, the other joins, both see two members
* The player's clan name is shown in the game header

## Hand-offs

These are implementation dependencies derived from the CSV, without invented delivery dates. Use mock responses while the matching endpoint is being implemented.

| Direction | CSV tasks | Deliverable |
| --- | --- | --- |
| A → C | T7 → T24 | Player-token endpoint; the demo server holds the secret API key. |
| B → C | T3, T10–T14 → T21–T23 | Social API contract, error format, configured origins and clan operations. |
| C → demo game | T21–T23 → T25 | SDK core client, no-clan panel and my-clan members panel. |

## Completion and demo

Use two tabs as two players: one creates a clan, the second joins, both see two members, and the clan name appears in the game header. Refresh or polling updates the member list.

Report, slides and rehearsal tasks are not specified in the CSV; the previous dated assignments are not carried into this task list.

## Retained design reference

The following technical sections preserve the original architecture and flow. They describe the broader design, not the current implementation checklist. For this backlog, implement only the two-service clan scope above: Go `net/http` ServeMux, React with plain JavaScript and plain CSS, one demo game. Realtime, friends, chat, RabbitMQ, config publishing, live preview, two-game demos and their associated tooling have no tasks in this CSV. Current task descriptions and acceptance criteria take precedence over older routes, libraries and examples below.

## JS SDK

The SDK is the part games load: it reads the published config, draws the social panel the way the developer chose, and talks to Social and Realtime. The config says what the panel looks like; the SDK is the code that draws it.

**Packaging**

- Plain JavaScript, bundled with Vite in library mode into `socialkit.js` (ES module) and `socialkit.umd.js` (script tag).
- No React, Tailwind or Zustand inside the SDK; native `fetch`, not axios. Dev tools are `vite`, `vitest` and `jsdom` only. Target bundle: under 60 KB gzipped.
- UI built as Web Components inside a Shadow DOM (`<socialkit-panel>`), so game CSS cannot break the panel and the panel cannot break the game.
- Theme applied as `--sk-*` CSS custom properties from `config.theme` (`--sk-primary`, `--sk-bg`, …); components never use raw colors.

**How a game integrates it**

```js
import SocialKit from "socialkit";

const kit = await SocialKit.init({
  publicKey: "pk_live_8c2f…",
  token: loginResponse.socialToken,
  getToken: () => fetch("/api/social-token").then(r => r.json()).then(j => j.token),
  container: document.body          // optional, default body
});

// Optional hooks for game logic
kit.on("message", m => game.showToast(`${m.sender_name}: ${m.body}`));
kit.on("clanJoined", c => game.setClanTag(c.tag));

// Optional headless use without the built-in UI
await kit.friends.sendRequest(playerId);
```

**Modules**

| Module | Job | Legacy task reference |
| --- | --- | --- |
| `api.js` | fetch wrapper, adds token, refreshes on 401 | legacy task |
| `socket.js` | WebSocket connect, reconnect with backoff (1, 2, 4… up to 30 s), request/reply by `id` | legacy task |
| `store.js` | Tiny state store: friends, requests, clan, conversations, presence, unread counts | legacy task |
| `config.js` | Load config by public key, cache in `sessionStorage`, reload on `config.updated` | legacy task, legacy task |
| `events.js` | `kit.on(...)` emitter for the game | legacy task |
| `ui/` | Launcher button, panel with tabs (Friends, Clan, Chat), chat window, toast | legacy task to legacy task |

Layering goes one way only: `ui/` → `store.js` → `api.js` / `socket.js`. Every response goes through a mapper before reaching the store. Store and mapper tests sit next to the code (Vitest).

**How the config drives the UI**

- `features.clans.enabled = false` → no Clan tab.
- `layout.position` → panel docked to that corner.
- `features.chat.max_message_length` → input `maxlength` and counter (the server enforces it too).
- `texts.*` → every label.
- Message text is always rendered with `textContent`, so HTML in a message shows as text.

**Preview mode (legacy task)**

The dashboard loads the same SDK with `SocialKit.preview({ config, mock: true })`, which uses fake friends, a fake clan and fake messages, and no network. Murad's editor mounts it in `ConfigPreview`, so the preview always matches what players will see.

## Demo games

Two small browser games with different genres and different configs prove that the same toolkit fits both with no code changes on our side. The games are a stage for the social layer, so keep the gameplay minimal.

|  | Game A: arena shooter | Game B: farm / idle |
| --- | --- | --- |
| Legacy task reference | legacy task, legacy task | legacy task |
| Engine | Phaser 3 | Plain canvas clicker game (about 1 day of work) |
| Multiplayer | Not needed; single player is fine | Not needed |
| Backend | One shared Go demo backend (legacy task) | Same backend, its own project secret |
| Theme | Dark, red accent, panel bottom-left | Light, green accent, panel bottom-right |
| Clans | On, max 10, tags shown above player | Off |
| Chat | DM + clan chat, slow mode 3 s, profanity filter on | DM only, longer messages (500) |
| Game hook | Clan tag drawn above the player sprite (`clanJoined` event) | Toast when a friend comes online |
| URL | http://arena.localhost | http://farm.localhost |

**Demo backend (legacy task)**

- A small Go server: login with the seeded usernames, then it calls Platform's `POST /player-tokens` with the right project secret and returns the token to the game.
- One backend serves both games; it picks the Arena or Farm secret by which game is calling. The architecture doc's monorepo still shows a backend under each game folder; use the single shared one.
- The game then calls `SocialKit.init({ publicKey, token })` right after login.

**Seed data (legacy task)**

One developer, two projects (Arena, Farm) with fixed keys, and four players, so both games and the E2E script work on a fresh database.

## Infrastructure

Everything runs with one `docker compose up`: 3 Go services, the dashboard, 2 demo games, one shared demo backend, Traefik, Postgres and RabbitMQ, 10 containers in all. C keeps that command working for the whole team.

**Monorepo layout**

```
socialkit/
├── services/
│   ├── platform/        # cmd/, internal/{http,repo,config,auth}, migrations/
│   ├── social/
│   └── realtime/
├── pkg/                 # shared Go: jwt, rabbit, outbox, pg, httpx, logx
├── sdk/                 # JS SDK (Vite library mode)
├── dashboard/           # React app
├── demo/
│   ├── arena/           # game A frontend
│   ├── farm/            # game B frontend
│   └── backend/         # shared Go demo backend
├── api/openapi.yaml     # REST contracts
├── deploy/
│   ├── docker-compose.yml
│   ├── traefik.yml
│   └── postgres-init.sql  # creates the 3 schemas and 3 DB users
├── go.work
└── Makefile             # up, down, migrate, test, seed
```

**Containers**

| Container | Image / build | Host URL |
| --- | --- | --- |
| traefik | `traefik:v3` | http://localhost |
| platform | build `services/platform` | via `/platform` |
| social | build `services/social` | via `/social` |
| realtime | build `services/realtime` | via `/realtime` (incl. WebSocket) |
| dashboard | build `dashboard` (nginx serving static files; also serves `/sdk/socialkit.js`) | http://app.localhost |
| arena | build `demo/arena` | http://arena.localhost |
| farm | build `demo/farm` | http://farm.localhost |
| demo-backend | build `demo/backend` | via each game's `/api` |
| postgres | `postgres:16` | localhost:5432 |
| rabbitmq | `rabbitmq:3-management` | localhost:15672 (UI) |

**Traefik (legacy task, legacy task)**

- Route `/platform`, `/social` and `/realtime` (WebSocket included) on any host; CORS for the game origins. Builds on the Compose setup from legacy task.
- Rate limit middleware on Nov 15, then the fresh-clone check: clone the repo, copy `.env.example`, run compose, with no manual fixes.

**Shared Go basics (legacy task)**

JSON logger (`slog`), HTTP error helper, Postgres pool helper (`pgx`), env config loader; used by all three services. Each Go service also has `/healthz` (process up), `/readyz` (DB and RabbitMQ reachable), graceful shutdown on SIGTERM, and a multi-stage Dockerfile ending in a distroless image.

**Configuration** comes from environment variables (`DATABASE_URL`, `RABBITMQ_URL`, `JWT_PUBLIC_KEY`, …) in a `.env` file that is not committed; `.env.example` is committed.

**Testing**

- E2E script (legacy task): register developer → create project → two player tokens → friend request → accept → DM over WebSocket → assert received. It must exit 0 on a fresh stack in under a minute.
- Unit tests for the rules (clan capacity, slow mode, config validation) live with each owner's service.
- Integration tests with `testcontainers-go` and GitHub Actions are in the architecture doc but have no Jira task; add them only if time is left.
