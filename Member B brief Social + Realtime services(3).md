# Member B brief: Backend infrastructure + Social service

Nov 6, 2026 · Farida Shakikhanli

> Task update — Nov 6, 2026. The attached `clan-platform-backlog (1)(1).csv` is the source for the current tasks, epic relationships and assignees. E1–E6 and T1–T25 are CSV identifiers, not Jira issue keys. The CSV supplies no dates, sprint assignments, story points or completion status, so these are not inferred. Checkboxes below are tracking placeholders.

## Scope

B owns the two-service backend layout, shared code, Compose, CORS and OpenAPI, plus players, clans, membership, internal clan endpoints and real-Postgres rule tests.

11 tasks assigned to Farida Shakikhanli.

| CSV epic | Area | Assignee |
| --- | --- | --- |
| E1 | Backend infrastructure (two services) | Farida Shakikhanli |
| E3 | Social service | Farida Shakikhanli |

## Tasks from the CSV

Tasks are grouped by their CSV parent epic and retain the source order, titles, descriptions, labels and assignees.

### E1: Backend infrastructure (two services)

Monorepo clan-backend with two Go services, platform and social, plus shared code in pkg/. One PostgreSQL instance with one schema per service. Docker Compose runs everything. Stack: Go with net/http (no Chi). React with plain JavaScript and plain CSS (no TypeScript, no Tailwind).

#### T1: Set up clan-backend monorepo with platform and social services

- [ ] Complete T1

Assignee: Farida Shakikhanli · Parent: E1 · Label: `infra`

Create the folder layout: services/platform and services/social (each with cmd/, internal/ handler-service-repository, migrations/), pkg/ for shared code (config, logging, Postgres pool, HTTP error format, JWT helpers) and go.work. Each service is its own Go program.

**Acceptance criteria**

* Both services build and start on their own (go run ./services/platform/cmd, go run ./services/social/cmd)
* Routing uses net/http ServeMux, no Chi
* Shared code lives only in pkg/; services never import each other's internal packages
* go build ./... and go vet ./... pass

#### T2: Docker Compose: Postgres, platform and social

- [ ] Complete T2

Assignee: Farida Shakikhanli · Parent: E1 · Label: `infra`

docker-compose.yml with postgres, platform (8081) and social (8082). Postgres init script creates schemas platform and social, each with its own database user that can only use its own schema.

**Acceptance criteria**

* docker compose up starts all three containers
* Each service has GET /health (process up) and GET /ready (database reachable)
* The platform DB user cannot read the social schema and the other way around
* .env.example documents all variables; .env is not committed

#### T3: CORS, error format and OpenAPI for both services

- [ ] Complete T3

Assignee: Farida Shakikhanli · Parent: E1 · Label: `infra`

Configure allowed origins for the dashboard and the demo game. Use one JSON error shape in both services. Start one OpenAPI file per service.

**Acceptance criteria**

* Error shape is { error: { code, message } } in both services
* CORS allows only configured origins
* openapi/platform.yaml and openapi/social.yaml exist and match the implemented routes

### E3: Social service

Players, clans and clan members: list, create, join, my clan, members. Owns the social schema. Port 8082.

#### T9: Social: service skeleton, schema and player token check

- [ ] Complete T9

Assignee: Farida Shakikhanli · Parent: E3 · Label: `social`

Migrations for the social schema: players, clans, clan_members. Middleware verifies the player JWT with platform's public key (no call to platform per request). game_id is always taken from the token.

**Acceptance criteria**

* Tables use UUIDs, timestamps, unique keys and foreign keys
* clan_members has unique (game_id, player_id): one clan per player per game
* Requests without a valid player token get 401; developer tokens are rejected
* game_id never comes from the request body or URL

#### T10: Social: player record on first use

- [ ] Complete T10

Assignee: Farida Shakikhanli · Parent: E3 · Label: `social`

GET /api/v1/players/me returns the player and creates the players row the first time a (game_id, external_id) appears.

**Acceptance criteria**

* First call creates the player; later calls return the same player
* Display name is updated from the token
* Test covers first and repeated calls

#### T11: Social: list clans

- [ ] Complete T11

Assignee: Farida Shakikhanli · Parent: E3 · Label: `social`

GET /api/v1/clans returns the clans of the player's game, with optional ?q= search.

**Acceptance criteria**

* Returns id, name, memberCount, maxMembers
* Only clans of the same game are returned
* Search by name is case-insensitive
* Test: a player of game A cannot see game B's clans

#### T12: Social: create clan

- [ ] Complete T12

Assignee: Farida Shakikhanli · Parent: E3 · Label: `social`

POST /api/v1/clans with { name }. The creator becomes the owner.

**Acceptance criteria**

* Name 3 to 20 characters, unique per game
* A player already in a clan gets 409
* Clan and owner membership are saved in one transaction
* Returns 201 with the clan

#### T13: Social: join clan

- [ ] Complete T13

Assignee: Farida Shakikhanli · Parent: E3 · Label: `social`

POST /api/v1/clans/{clanID}/join for open clans of the same game.

**Acceptance criteria**

* Player joins with role member
* Already in a clan gets 409; full clan (default max 10) gets 409 clan_full
* Clan row is locked while joining (SELECT ... FOR UPDATE) so the limit cannot be exceeded
* A clan of another game returns 404

#### T14: Social: my clan and clan members

- [ ] Complete T14

Assignee: Farida Shakikhanli · Parent: E3 · Label: `social`

GET /api/v1/players/me/clan and GET /api/v1/clans/{clanID}/members.

**Acceptance criteria**

* /players/me/clan returns { clan, role } or 404 if no clan
* Members list returns display name and role
* Works only within the same game

#### T15: Social: internal endpoints for platform

- [ ] Complete T15

Assignee: Farida Shakikhanli · Parent: E3 · Label: `social`

GET /internal/games/{gameID}/clans and GET /internal/clans/{clanID}/members, used only by the platform service. Protected by an internal service token (shared secret from env) and not exposed to browsers.

**Acceptance criteria**

* Requests without the internal token get 401
* Not reachable through the public CORS setup
* Response format matches the player endpoints

#### T16: Social: tests for clan rules

- [ ] Complete T16

Assignee: Farida Shakikhanli · Parent: E3 · Label: `social`

Integration tests against a real Postgres for the clan rules.

**Acceptance criteria**

* Cross-game isolation test
* Two players joining a clan with one free spot at the same time: only one succeeds
* go test ./... passes

## Hand-offs

These are implementation dependencies derived from the CSV, without invented delivery dates. Use mock responses while the matching endpoint is being implemented.

| Direction | CSV tasks | Deliverable |
| --- | --- | --- |
| A → B | T7 → T9 | Player JWT claims and public verification key; no Platform call per player request. |
| B → A | T1–T3 | Backend layout, shared helpers, Compose, CORS and OpenAPI. |
| B → A | T15 → T8 | Protected internal clan/member endpoints. |
| B → C | T10–T14 → T21–T23 | Player profile and clan REST responses for the SDK. |

## Completion and demo

Run the required backend checks and real-Postgres integration tests, including cross-game isolation and concurrent joins for the final free clan slot. Show that the two services use separate database schemas and internal REST.

Report, slides and rehearsal tasks are not specified in the CSV; the previous dated assignments are not carried into this task list.

## Retained design reference

The following technical sections preserve the original architecture and flow. They describe the broader design, not the current implementation checklist. For this backlog, implement only the two-service clan scope above: Go `net/http` ServeMux, React with plain JavaScript and plain CSS, one demo game. Realtime, friends, chat, RabbitMQ, config publishing, live preview, two-game demos and their associated tooling have no tasks in this CSV. Current task descriptions and acceptance criteria take precedence over older routes, libraries and examples below.

## Social service

Social owns players, friendships and clans, and enforces the rules from the published config. `project_id` always comes from the player token, never from the request, so one game can never see another game's data.

**What it does**

- Creates a player record the first time a token for a new `(project_id, external_player_id)` appears.
- Friend requests and friendships.
- Clans: create, join, leave; enforces `max_members`, `clans.enabled` and the other rules from the config.
- Answers Realtime's questions ("are A and B friends?", "who is in clan X?"); events mirror the same data, so Realtime rarely asks.

**Schema `social`**

```sql
create table players (
  id uuid primary key,
  project_id uuid not null,
  external_id text not null,              -- the game's own player ID
  display_name text not null,
  created_at timestamptz not null default now(),
  unique (project_id, external_id)
);

create table friend_requests (
  id uuid primary key,
  project_id uuid not null,
  from_player uuid not null references players(id),
  to_player uuid not null references players(id),
  status text not null,                   -- pending | accepted | declined | cancelled
  created_at timestamptz not null default now(),
  unique (project_id, from_player, to_player)
);

create table friendships (
  project_id uuid not null,
  player_a uuid not null references players(id),  -- smaller UUID
  player_b uuid not null references players(id),  -- larger UUID
  created_at timestamptz not null default now(),
  primary key (project_id, player_a, player_b),
  check (player_a < player_b)
);

create table blocks (
  project_id uuid not null,
  blocker uuid not null references players(id),
  blocked uuid not null references players(id),
  primary key (project_id, blocker, blocked)
);

create table clans (
  id uuid primary key,
  project_id uuid not null,
  name text not null,
  tag text,
  description text,
  owner_id uuid not null references players(id),
  member_count int not null default 1,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

create table clan_members (
  clan_id uuid not null references clans(id) on delete cascade,
  player_id uuid not null references players(id),
  project_id uuid not null,
  role text not null,                     -- owner | member
  joined_at timestamptz not null default now(),
  primary key (clan_id, player_id),
  unique (project_id, player_id)          -- one clan per player per game
);

create table outbox (
  id bigserial primary key,
  routing_key text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
```

- `member_count` is updated in the same transaction as `clan_members`, with `select … for update` on the clan row, so two simultaneous joins cannot exceed `max_members`.
- `outbox` is created now but stays unused in this build; events are published directly.

**Endpoints (`/social/v1`, player token)**

| Method | Path | Purpose | Legacy task reference |
| --- | --- | --- | --- |
| GET | `/me` | My player profile, clan, counts | legacy task |
| GET | `/players/search?q=` | Find players by display name in this game | legacy task |
| GET | `/friend-requests?dir=in` | Incoming or outgoing requests | legacy task |
| POST | `/friend-requests` | Send request `{ to_player_id }` | legacy task |
| POST | `/friend-requests/{id}/accept` | Accept | legacy task |
| POST | `/friend-requests/{id}/decline` | Decline | legacy task |
| GET | `/friends` | My friends | legacy task |
| DELETE | `/friends/{playerId}` | Remove friend | legacy task |
| GET | `/clans?q=` | Search clans | legacy task |
| POST | `/clans` | Create clan `{ name, tag, description }` | legacy task |
| GET | `/clans/{id}` | Clan with members | legacy task |
| POST | `/clans/{id}/join` | Join open clan | legacy task |
| POST | `/clans/{id}/leave` | Leave | legacy task |
| GET | `/internal/players/{id}` | Display name lookup (internal) | legacy task |
| GET | `/internal/friendships/check?a=&b=` | Fallback friend check (internal) | legacy task |

Errors use one shape: `{ "error": { "code": "clan_full", "message": "Clan has reached 30 members" } }`. Codes B needs: `clan_full` (409), `feature_disabled` (403), plus 401 for a missing or developer token.

Blocks, kick, transfer ownership and disband are in the architecture doc but have no Jira task; leave them until after the freeze. Since transfer is cut, decide at stand-up what happens when an owner calls leave (reject it, or disband the clan when the owner is the last member).

**Config rules B enforces**

- Clans disabled → `403 feature_disabled` on every clan endpoint (legacy task).
- `max_friends` checked on accept (legacy task); `max_members` checked on join (legacy task).
- Config loaded from Platform's `GET /internal/config/{projectId}` at startup, kept in memory, reloaded on `config.published` (legacy task).

## Realtime service

Realtime holds every player's WebSocket, stores and fans out chat messages, and tracks who is online. It keeps its own copy of conversation membership, filled from events, and never joins across schemas.

**What it does**

- One WebSocket per player tab, authenticated with the player JWT on connect.
- Conversations: one DM per friendship, one channel per clan.
- Saves messages, serves history, fans out new messages to connected members.
- Presence: online/offline kept in memory and announced to friends on change.
- Applies message rules from config: max length, slow mode, profanity filter.
- Pushes notifications (friend request received, clan join) that arrive as events.

**Schema `realtime`**

```sql
create table conversations (
  id uuid primary key,
  project_id uuid not null,
  kind text not null,                     -- dm | clan
  clan_id uuid,                           -- set when kind = clan
  dm_key text,                            -- "<player_a>:<player_b>" when kind = dm
  created_at timestamptz not null default now(),
  unique (project_id, dm_key),
  unique (project_id, clan_id)
);

create table conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  player_id uuid not null,
  display_name text not null,             -- copied from events
  primary key (conversation_id, player_id)
);

create table messages (
  id uuid primary key,                    -- UUIDv7, sortable by time
  conversation_id uuid not null references conversations(id) on delete cascade,
  project_id uuid not null,
  sender_id uuid not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index on messages (conversation_id, id desc);
```

**REST (`/realtime/v1`, player token)**

| Method | Path | Purpose | Legacy task reference |
| --- | --- | --- | --- |
| GET | `/conversations` | My DMs and clan channel, with last message and unread count | legacy task |
| GET | `/conversations/{id}/messages?before={msgId}&limit=50` | History, newest first | legacy task |
| GET | `/ws?token=` | Upgrade to WebSocket | legacy task |

Sending a message goes over the WebSocket, not REST, so ordering and rate limits live in one place. Every frame is `{ "type": …, "data": … }`.

**Client → server**

| Type | Data | Reply |
| --- | --- | --- |
| `message.send` | `{ conversation_id, body }` | `message.ack { message_id, created_at }` or `error` |
| `conversation.read` | `{ conversation_id, last_message_id }` | none |
| `ping` | `{}` | `pong` |

**Server → client**

| Type | Data | When |
| --- | --- | --- |
| `hello` | `{ player_id, config_version, online_friends: [ids] }` | Right after connect |
| `message.new` | `{ conversation_id, message: { id, sender_id, sender_name, body, created_at } }` | New message in a conversation I belong to |
| `presence.update` | `{ player_id, status: "online" \| "offline" }` | A friend connects or drops |
| `notification` | `{ kind, payload }` | From events |
| `conversation.added` / `conversation.removed` | `{ conversation }` | Became friends, joined or left a clan |
| `config.updated` | `{ version }` | Developer published |
| `error` | `{ code, message, reply_to }` | e.g. `slow_mode`, `too_long`, `not_member` |

**Server rules for `message.send`**

1. Sender is a member of the conversation (in-memory membership map), else `not_member`.
2. Body is trimmed, non-empty, at most `max_message_length`, else `too_long`.
3. Slow mode: the player's last message was at least `slow_mode_seconds` ago, else `slow_mode`.
4. If `profanity_filter` is on, banned words become `***` (word list in a file).
5. Insert into `messages`, then send `message.new` to every connected member, including the sender's other tabs.

The architecture doc also checks blocks for DMs; blocks are cut from this build, so skip that step.

**Connection handling**

- Library: `github.com/coder/websocket`.
- One reader and one writer goroutine per connection; the writer drains a buffered channel (size 64). A full buffer means a slow client, which is disconnected.
- A `Hub` keeps `map[projectID]map[playerID][]*Conn` behind a mutex. Presence = the player has at least one connection.
- Ping every 25 s; drop the connection after 60 s with no pong.
- Offline after a 10 s grace period, so a page refresh does not flash offline to friends.

## Events

One topic exchange, `socialkit.events`, carries every event between services; B writes it down in `api/events.md` on Nov 6 and builds `pkg/rabbit` on Nov 9.

| Routing key | Producer | Payload | Consumers and what they do | Legacy task reference |
| --- | --- | --- | --- | --- |
| `config.published` | Platform | `project_id, version` | Social, Realtime: reload config. Realtime: push `config.updated` | legacy task, legacy task |
| `friend.request_sent` | Social | `project_id, request_id, from{id,name}, to_id` | Realtime: `notification` to receiver | legacy task, legacy task |
| `friend.accepted` | Social | `project_id, a{id,name}, b{id,name}` | Realtime: create DM conversation, `conversation.added` + `notification`, start sharing presence | legacy task, legacy task |
| `friend.removed` | Social | `project_id, a_id, b_id` | Realtime: remove DM membership, `conversation.removed` | legacy task, legacy task |
| `clan.created` | Social | `project_id, clan_id, name, owner{id,name}` | Realtime: create clan conversation with owner | legacy task, legacy task |
| `clan.member_joined` | Social | `project_id, clan_id, player{id,name}` | Realtime: add member, notify clan | legacy task, legacy task |
| `clan.member_left` | Social | `project_id, clan_id, player_id, reason: left` | Realtime: remove member | legacy task, legacy task |

`player.blocked`, `clan.disbanded` and the `kicked` reason belong to features cut from this build; keep them in `api/events.md` as future work.

**Envelope**

```json
{
  "event_id": "0193…",
  "type": "clan.member_joined",
  "occurred_at": "2026-11-05T11:20:00Z",
  "data": { "project_id": "…", "clan_id": "…", "player": { "id": "…", "name": "Rashad" } }
}
```

**Queues**

- `social.config` → `config.published`
- `realtime.events` → `config.published`, `friend.*`, `clan.*`

**Reliability in this build**

- **Direct publish:** the producer publishes right after its database commit, with publisher confirms on.
- **Manual ack** after the handler succeeds; on error, requeue once, then log and drop.
- **Known gap, named in the defense:** if RabbitMQ is down between commit and publish, the event is lost. The fix is the outbox pattern plus a dead-letter queue and idempotent consumers, listed as future work.
