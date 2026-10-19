# MediEval Game Service

Postgres-backed game mechanics service for MediEval.

The listing eval dashboard still serves cards and receives eval results. This
service owns the game layer:

- reviewer profiles
- XP, gold, ranks, and streaks
- correction counts and answer counts
- daily quests
- idempotent verdict events
- leaderboard data

## API

See `docs/API.md` for the full request and response contract.

All `/api/game/*` routes require `Authorization: Bearer <MEDIEVAL_GAME_TOKEN>`.
When `NODE_ENV=production`, startup fails if `MEDIEVAL_GAME_TOKEN` is blank
unless `MEDIEVAL_ALLOW_UNAUTHENTICATED=true` is explicitly set for a public dev
deployment.
Production startup also requires either `DATABASE_URL` or the split
`POSTGRES_HOST`, `POSTGRES_DB`, and `POSTGRES_USER` variables. Coolify should use
`DATABASE_URL`.

### `GET /health`

Returns process liveness.

### `GET /ready`

Returns readiness and checks database reachability. Use this as the Coolify
health check path.

### `GET /api/game/profile?reviewer=Davide`

Returns the reviewer profile and daily quests.

### `POST /api/game/verdicts`

Records one verdict for game rewards.

```json
{
  "eventId": "optional-stable-id",
  "reviewer": "Davide",
  "cardId": "abc123",
  "answer": "no",
  "correction": {
    "correctAnswer": "Charging cable",
    "reasonTags": ["wrong_item"]
  },
  "priority": "high",
  "confidence": 0.42,
  "sourceKey": "dailySale:ebyUS:123",
  "claimTemplate": "component_title_or_label",
  "durationMs": 3400,
  "clientGeneratedAt": "2026-06-23T17:00:00.000Z"
}
```

### `GET /api/game/leaderboard?limit=25`

Returns ranked reviewer profiles.

## Local Docker Run

Before running the service, you can run the local preflight:

```bash
npm run preflight
```

The preflight runs tests and syntax checks, then skips checks that require a
real database, Docker, or a live deployed URL unless you provide the matching
environment variables. It also validates the Docker, Compose, environment, CI,
and Coolify files without needing Docker installed.

For a fast local process-level smoke without Docker, run:

```bash
npm run smoke:memory
```

That starts the same HTTP API with an in-memory store, runs the normal smoke
client against it, and shuts it down. Production startup still requires
Postgres.

If you have a reachable Postgres database but are not using Docker, run the
full Postgres-backed local API smoke:

```bash
DATABASE_URL=postgres://user:password@host:5432/medieval \
MEDIEVAL_RUN_POSTGRES_SMOKE=1 \
npm run preflight
```

That runs migrations, starts the API locally with `NODE_ENV=production`, runs
the authenticated write smoke, checks duplicate-event protection, then shuts the
temporary API process down. To run only that check:

```bash
DATABASE_URL=postgres://user:password@host:5432/medieval npm run smoke:postgres
```

```bash
docker compose up --build
```

The API will be available at `http://localhost:8080` and Postgres at local port
`54329`. The Compose file waits for Postgres to pass `pg_isready`, then checks
the API with `/ready`.

To smoke test a running local or deployed service:

```bash
MEDIEVAL_GAME_BASE_URL=http://localhost:8080 \
MEDIEVAL_GAME_TOKEN=local-dev-token \
npm run smoke
```

The smoke command also checks that game API routes reject unauthenticated
requests and that browser-style CORS preflight allows the authorization and JSON
headers MediEval uses. For an intentionally public local-only experiment, set
`MEDIEVAL_GAME_EXPECT_AUTH=false`.

To include the Docker/Postgres smoke in preflight:

```bash
MEDIEVAL_RUN_DOCKER_SMOKE=1 npm run preflight
```

## Coolify

See `docs/COOLIFY.md` for the deployment checklist.
The [maintainer verification guide](../docs/maintainers/VERIFY.md) has the full
end-to-end checklist.

## GitHub Verification

This folder can also be pushed as its own repository. The workflow at
`.github/workflows/ci.yml` runs the API tests, syntax checks, builds the Docker
image, runs migrations against a real Postgres service, and smokes a live API
process.

That gives you a clean pre-Coolify signal that the image builds, the service
starts, reaches Postgres, records a verdict, protects duplicate events, and
returns leaderboard data.

Create a new app from this folder and attach a Postgres database. Set:

- `DATABASE_URL`: Coolify Postgres connection string
- `MEDIEVAL_GAME_TOKEN`: shared secret used by the iOS app
- `MEDIEVAL_ALLOW_UNAUTHENTICATED`: leave blank or `false` in production
- `PORT`: `8080`
- `CORS_ORIGIN`: `*`
- `DB_WAIT_TIMEOUT_MS`: optional startup database wait timeout, default `60000`
- `DB_WAIT_INTERVAL_MS`: optional startup retry interval, default `1500`
- `SHUTDOWN_TIMEOUT_MS`: optional graceful shutdown timeout, default `10000`

The Docker image waits for Postgres, runs migrations, and then starts the API.
