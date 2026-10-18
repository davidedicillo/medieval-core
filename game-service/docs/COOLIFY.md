# Coolify Deployment

This service is designed to be deployed as a Docker app with a Postgres resource.

## 1. Create the Postgres database

In Coolify, add a Postgres database for the app. Keep the generated internal
connection string handy; it becomes `DATABASE_URL`.

## 2. Create the app

Create a new app from the `game-service` folder/repository and use the
provided `Dockerfile`.

Before pointing Coolify at the repo, a green `MediEval Game Service` GitHub
workflow proves that the Docker image builds, migrations run against Postgres,
and the API smoke test can write a verdict.

Set these environment variables:

```text
PORT=8080
DATABASE_URL=<Coolify Postgres internal connection string>
MEDIEVAL_GAME_TOKEN=<long random shared secret>
MEDIEVAL_ALLOW_UNAUTHENTICATED=false
CORS_ORIGIN=*
DB_WAIT_TIMEOUT_MS=60000
DB_WAIT_INTERVAL_MS=1500
SHUTDOWN_TIMEOUT_MS=10000
```

The Docker image runs with `NODE_ENV=production`. If `DATABASE_URL` or
`MEDIEVAL_GAME_TOKEN` is missing, startup fails immediately instead of serving a
half-configured backend.

The image startup command waits for Postgres, runs migrations, and then starts
the API. The first deploy should create:

- `schema_migrations`
- `reviewers`
- `reviewer_progress`
- `verdict_events`

The Docker image also defines a `/ready` health check. That health check only
passes after the API can reach Postgres.

## 3. Set the health check

Use:

```text
/ready
```

`/health` only proves the process is alive. `/ready` also checks that Postgres is
reachable.

## 4. Configure MediEval on iOS

In the app settings:

- Dashboard URL: the existing listing eval dashboard URL
- Dashboard token: `EVAL_MOBILE_TOKEN` from the dashboard server
- Guild backend URL: the Coolify URL for this service
- Guild backend token: `MEDIEVAL_GAME_TOKEN`

The app keeps working if the guild backend is blank. It will store local XP/gold
on-device and continue sending listing eval results to the dashboard.

## 5. Smoke test after deploy

From the service folder, replace the URL and token values below:

```bash
MEDIEVAL_GAME_BASE_URL=https://your-service.example.com \
MEDIEVAL_GAME_TOKEN=<same value as Coolify MEDIEVAL_GAME_TOKEN> \
npm run smoke
```

You can also run the broader preflight against the deployed service:

```bash
MEDIEVAL_GAME_BASE_URL=https://your-service.example.com \
MEDIEVAL_GAME_TOKEN=<same value as Coolify MEDIEVAL_GAME_TOKEN> \
npm run preflight
```

If you want to prove the service locally against the Coolify Postgres
connection string before or after deploy, run:

```bash
DATABASE_URL=<Coolify Postgres internal connection string> \
MEDIEVAL_GAME_TOKEN=<same value as Coolify MEDIEVAL_GAME_TOKEN> \
MEDIEVAL_RUN_POSTGRES_SMOKE=1 \
npm run preflight
```

That path runs migrations, starts the API locally with production settings,
writes a smoke verdict through the HTTP API, verifies duplicate protection, and
then stops the local API process.

Or test the endpoints manually:

```bash
curl https://your-service.example.com/ready
curl -H "Authorization: Bearer $MEDIEVAL_GAME_TOKEN" \
  "https://your-service.example.com/api/game/profile?reviewer=Davide"
curl -X POST "https://your-service.example.com/api/game/verdicts" \
  -H "Authorization: Bearer $MEDIEVAL_GAME_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "eventId": "manual-smoke-test-1",
    "reviewer": "Davide",
    "cardId": "manual-card-1",
    "answer": "yes",
    "priority": "high",
    "confidence": 0.5,
    "sourceKey": "manual",
    "claimTemplate": "smoke_test",
    "durationMs": 1200,
    "clientGeneratedAt": "2026-06-23T17:00:00.000Z"
  }'
```

The second time you run the same verdict request, `duplicate` should be `true`
and `awarded` should be zero.

The smoke command also verifies that authenticated game routes reject requests
without the shared token and that CORS preflight allows `Authorization` and
`content-type` headers. If auth fails, confirm `MEDIEVAL_GAME_TOKEN` is set in
Coolify and `MEDIEVAL_ALLOW_UNAUTHENTICATED` is blank or `false`.
