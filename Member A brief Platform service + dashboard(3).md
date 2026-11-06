# Member A brief: Platform service + dashboard

Nov 6, 2026 · Murad Hasanli

> Task update — Nov 6, 2026. The attached `clan-platform-backlog (1)(1).csv` is the source for the current tasks, epic relationships and assignees. E1–E6 and T1–T25 are CSV identifiers, not Jira issue keys. The CSV supplies no dates, sprint assignments, story points or completion status, so these are not inferred. Checkboxes below are tracking placeholders.

## Scope

A is finished when a developer can register and log in, register an existing game, manage its API keys, and inspect its clans and members through the dashboard. Platform also issues player tokens and calls Social over internal REST.

9 tasks assigned to Murad Hasanli.

| CSV epic | Area | Assignee |
| --- | --- | --- |
| E2 | Platform service | Murad Hasanli |
| E4 | Dashboard (clan-frontend) | Murad Hasanli |

## Tasks from the CSV

Tasks are grouped by their CSV parent epic and retain the source order, titles, descriptions, labels and assignees.

### E2: Platform service

Developers, registered games, API keys and player tokens. Owns the platform schema. Port 8081.

#### T4: Platform: developer register, login and me

- [ ] Complete T4

Assignee: Murad Hasanli · Parent: E2 · Label: `platform`

POST /api/v1/developers/register, POST /api/v1/developers/login, GET /api/v1/developers/me. Passwords hashed with bcrypt, developer JWT on login.

**Acceptance criteria**

* Register validates email and password; duplicate email gets 409
* Login returns a developer token; wrong password gets 401
* /developers/me works only with a developer token
* Tests cover register, login and wrong password

#### T5: Platform: register existing game

- [ ] Complete T5

Assignee: Murad Hasanli · Parent: E2 · Label: `platform`

POST /api/v1/games and GET /api/v1/games. A game is only an integration record (name, description) for an existing game, never game creation.

**Acceptance criteria**

* Developer can register a game and list only their own games
* Another developer's game returns 404 or 403
* Tests cover ownership

#### T6: Platform: game API keys

- [ ] Complete T6

Assignee: Murad Hasanli · Parent: E2 · Label: `platform`

POST /api/v1/games/{gameID}/api-keys, GET /api/v1/games/{gameID}/api-keys, DELETE /api/v1/api-keys/{keyID}. Keys are random, stored hashed, shown once.

**Acceptance criteria**

* The full key is returned only once, on creation
* Only a hash is stored in the database
* Revoked keys stop working immediately
* Only the game's owner can manage its keys

#### T7: Platform: issue player tokens

- [ ] Complete T7

Assignee: Murad Hasanli · Parent: E2 · Label: `platform`

POST /api/v1/players/auth is called by the game's own server with the secret API key and { externalPlayerId, displayName }. Platform returns a short-lived player JWT signed with a private key (EdDSA or RS256). The public key is given to the social service by config.

**Acceptance criteria**

* Valid API key returns a player token with game_id, external player ID, display name and expiry (1 hour)
* Wrong, revoked or missing key returns 401
* Private signing key only in platform; social gets only the public key
* Tests cover valid, wrong and revoked keys

#### T8: Platform: developer view of clans and members (calls social)

- [ ] Complete T8

Assignee: Murad Hasanli · Parent: E2 · Label: `platform`

GET /api/v1/games/{gameID}/clans and GET /api/v1/games/{gameID}/clans/{clanID}/members for the dashboard. Platform checks the developer owns the game, then calls the social service's internal endpoints over HTTP.

**Acceptance criteria**

* Only the game's owner can call them; others get 403
* Platform never queries the social schema; it calls social's internal REST API
* If social is down, the dashboard gets a clear 503 error
* Calls to social use a timeout

### E4: Dashboard (clan-frontend)

Developer web app: log in, register a game, create an API key, see the game's clans and members. Stack: Go with net/http (no Chi). React with plain JavaScript and plain CSS (no TypeScript, no Tailwind).

#### T17: Dashboard: project setup and API client

- [ ] Complete T17

Assignee: Murad Hasanli · Parent: E4 · Label: `dashboard`

Vite + React (JavaScript) app with React Router, a small fetch-based API client for the platform service and a base layout. Plain CSS.

**Acceptance criteria**

* npm run build passes
* API base URL comes from VITE_PLATFORM_URL
* No TypeScript, no Tailwind

#### T18: Dashboard: developer register and login

- [ ] Complete T18

Assignee: Murad Hasanli · Parent: E4 · Label: `dashboard`

Register and login pages, protected routes, log out.

**Acceptance criteria**

* Validation and server errors are shown
* Protected pages redirect to login when not logged in
* Log out clears the session

#### T19: Dashboard: games and API keys

- [ ] Complete T19

Assignee: Murad Hasanli · Parent: E4 · Label: `dashboard`

List and register existing games; create, list and revoke API keys for a game.

**Acceptance criteria**

* Wording is "Register existing game", never "Create game"
* New API key is shown once with a copy button and a warning to keep it on the game server
* Revoke asks for confirmation
* Loading, empty and error states

#### T20: Dashboard: clans page and members view

- [ ] Complete T20

Assignee: Murad Hasanli · Parent: E4 · Label: `dashboard`

For a game, show its clans with member counts; clicking a clan shows its members and roles (read-only).

**Acceptance criteria**

* Uses GET /games/{gameID}/clans and /games/{gameID}/clans/{clanID}/members on platform
* Search box filters by name
* Loading, empty and error states

## Hand-offs

These are implementation dependencies derived from the CSV, without invented delivery dates. Use mock responses while the matching endpoint is being implemented.

| Direction | CSV tasks | Deliverable |
| --- | --- | --- |
| A → B | T7 → T9 | Player JWT claims, public verification key and token examples. |
| B → A | T15 → T8 | Internal clan/member REST endpoints and internal service token. |
| A → C | T7 → T24 | POST /api/v1/players/auth and server-side API key requirements. |
| B → A, C | T3 | Shared error shape, configured origins and service OpenAPI contracts. |

## Completion and demo

Demonstrate developer login, registration of an existing game, API key management and the read-only clan/member views. Preserve the API key only on the game server.

Report, slides and rehearsal tasks are not specified in the CSV; the previous dated assignments are not carried into this task list.

## Retained design reference

The following technical sections preserve the original architecture and flow. They describe the broader design, not the current implementation checklist. For this backlog, implement only the two-service clan scope above: Go `net/http` ServeMux, React with plain JavaScript and plain CSS, one demo game. Realtime, friends, chat, RabbitMQ, config publishing, live preview, two-game demos and their associated tooling have no tasks in this CSV. Current task descriptions and acceptance criteria take precedence over older routes, libraries and examples below.

## Platform service

Platform is the only service that knows developers, projects and keys, and the only one that signs tokens. Social and Realtime verify tokens with its public key, so they never call Platform per request.

**What it does**

- Developer sign-up and login: email + password, bcrypt, developer JWT in an httpOnly cookie.
- Projects: one per game, each with a `public_key` (used in the browser) and a `secret_key` (only on the game's backend, stored as a SHA-256 hash, shown once).
- Config drafts and published versions; rollback = publish an old version as a new one.
- Serves the active config to the SDK by public key, cached in memory with an ETag.
- Exchanges a game backend's secret + player ID for a player JWT.

**Schema `platform`**

```sql
create table developers (
  id uuid primary key,
  email text unique not null,
  password_hash text not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table projects (
  id uuid primary key,
  developer_id uuid not null references developers(id),
  name text not null,
  public_key text unique not null,        -- pk_live_...
  secret_key_hash text not null,          -- sha256 of sk_live_...
  allowed_origins text[] not null default '{}',
  active_version int,
  created_at timestamptz not null default now()
);

create table config_drafts (
  project_id uuid primary key references projects(id),
  config jsonb not null,
  updated_at timestamptz not null default now()
);

create table config_versions (
  project_id uuid not null references projects(id),
  version int not null,
  config jsonb not null,
  published_by uuid not null references developers(id),
  published_at timestamptz not null default now(),
  primary key (project_id, version)
);
```

**Endpoints (`/platform/v1`)**

| Method | Path | Auth | Purpose | Legacy task reference |
| --- | --- | --- | --- | --- |
| POST | `/auth/register` | none | Create developer account | legacy task |
| POST | `/auth/login` | none | Log in, sets cookie | legacy task |
| POST | `/auth/logout` | developer | Clear cookie | legacy task |
| GET | `/me` | developer | Current developer | legacy task |
| GET | `/projects` | developer | List my projects | legacy task |
| POST | `/projects` | developer | Create project; returns secret key once | legacy task |
| GET | `/projects/{id}` | developer | Project details | legacy task |
| GET / PUT | `/projects/{id}/config/draft` | developer | Read / save draft (validated) | legacy task |
| POST | `/projects/{id}/config/publish` | developer | Publish draft as new version | legacy task |
| GET | `/public/config?key={public_key}` | none | Active config for the SDK (ETag) | legacy task |
| POST | `/player-tokens` | project secret | Issue player JWT | legacy task |
| GET | `/.well-known/jwks.json` | none | Public key for token checks | legacy task |

The architecture doc also lists rotate-secret, version history, restore and stats endpoints; they have no Jira task, so build them only if time is left after the freeze.

**Player token flow**

1. The game backend calls `POST /platform/v1/player-tokens` with `Authorization: Bearer <secret_key>` and body `{ "external_player_id": "u_42", "display_name": "Rashad" }`.
2. Platform checks the secret against the project, signs an EdDSA JWT and returns `{ "token": "…", "expires_in": 3600 }`.
3. The game passes the token to `SocialKit.init({ publicKey, token })`; Social and Realtime verify it with the public key.

```json
{
  "sub": "u_42",
  "pid": "prj_7f3a",
  "name": "Rashad",
  "typ": "player",
  "iat": 1762340000,
  "exp": 1762343600
}
```

The developer JWT uses `typ: "developer"`; Social and Realtime must reject it.

**Config validation rules**

- Every save is checked against a Go struct with limits: `max_members` 2–200, `max_message_length` 1–1000, colors as hex.
- `schema_version` lets the SDK and services handle old configs after the schema grows.
- `texts` lets a developer translate or rename UI labels.

**Publish flow**

1. `POST /projects/{id}/config/publish` copies the draft into `config_versions` as version N (immutable) and sets `active_version`.
2. Platform publishes `config.published { project_id, version }` to the `socialkit.events` exchange with B's `pkg/rabbit`.
3. Social and Realtime reload that project's config; Realtime pushes `config.updated` to every connected player, and the SDK re-renders without a reload.

## Dashboard

A React + plain JS (Vite) single-page app, no TypeScript. Libraries: TanStack Query for server data, Zustand for auth only, axios, react-hook-form + zod, Tailwind v4 + shadcn (`tsx: false`), sonner for toasts, vitest + MSW for tests. Full rules are in the Dashboard conventions tab of Social Toolkit for Indie Games — System Architecture.

**Pages**

| Page | What the developer does | Legacy task reference |
| --- | --- | --- |
| Sign up / Log in | Create account, log in | legacy task, legacy task |
| Projects | List projects, create one; the secret key is shown once with a copy button | legacy task |
| Integration | Public key and a copy-paste `SocialKit.init` snippet | legacy task |
| Editor | Left: form grouped as Theme, Layout, Features, Chat rules, Texts. Right: live preview of the SDK panel. Save draft, Publish | legacy task, legacy task, legacy task |

The Versions page and the rotate-secret and allowed-origins controls are in the architecture doc but have no Jira task; leave them for after the freeze.

**Folder structure**

```
dashboard/src/
├── app/              # providers, router, guards, index.css (tokens), main.jsx
├── pages/            # LoginPage, RegisterPage, ProjectsPage, EditorPage,
│                     # IntegrationPage, NotFoundPage
├── features/
│   ├── auth/           # login, register, logout, session restore
│   ├── projects/       # list, create, secret-shown-once dialog
│   ├── config-editor/  # draft form, live preview, publish
│   └── integration/    # keys, code snippet
├── entities/
│   ├── project/        # Project type, mapper, api + useProjectQuery
│   └── config/         # SocialConfig type, Zod schema, defaults
├── shared/           # api client, ui (shadcn), hooks, utils, config (env)
├── store/            # authStore (Zustand)
└── test/             # builders, msw handlers, wrappers
```

Features never import other features; they import only `entities/` and `shared/`. Named exports only (ESLint enforces both).

**Hooks per feature**

| Owner | Query hooks | Mutation hooks | Platform endpoint |
| --- | --- | --- | --- |
| `features/auth` | session restore in `AppInitializer` | `useLoginMutation`, `useRegisterMutation`, `useLogoutMutation` | `/auth/*`, `/me` |
| `features/projects` | `useProjectsQuery` | `useCreateProjectMutation` | `/projects` |
| `entities/project` | `useProjectQuery` | none | `/projects/{id}` |
| `features/config-editor` | `useConfigDraftQuery` | `useSaveDraftMutation`, `usePublishConfigMutation` | `/projects/{id}/config/draft`, `/config/publish` |
| `features/integration` | uses `useProjectQuery` | none | none of its own |

**Editor and live preview**

- The form edits a local copy of the config; the preview updates on every change with no server call.
- `features/config-editor/ui/ConfigPreview` is the only place the dashboard touches the SDK: it mounts `SocialKit.preview(config)` into a container ref, debounced 150 ms. The SDK comes in as the `socialkit` workspace package, so the preview always uses the current SDK code.
- Draft autosaves 3 s after the last change.

**Errors**

- Shared HTTP client: 401 → clear the auth store and redirect to Login; 5xx or network error → toast.
- Config editor: validation codes map to field paths in `features/config-editor/config/errorFieldMap.js` and show next to the field.
- Register: `email_taken` shows on the email field.
