# MediEval Game Service API

Base URL examples:

- Local Docker: `http://localhost:8080`
- Coolify: `https://your-medieval-game-service.example.com`

All `/api/game/*` routes require the shared token. The iOS app sends it as
`Authorization: Bearer <token>`. The service also accepts
`x-medieval-game-token: <token>` for manual testing.

When `NODE_ENV=production`, startup fails if `MEDIEVAL_GAME_TOKEN` is blank
unless `MEDIEVAL_ALLOW_UNAUTHENTICATED=true` is explicitly set for an
intentionally public dev deployment.
Production startup also fails without Postgres configuration. Set
`DATABASE_URL`, or set all of `POSTGRES_HOST`, `POSTGRES_DB`, and
`POSTGRES_USER`.

## Answers

Canonical answer values are:

- `yes`: the claim is correct
- `no`: the claim is wrong
- `unsure`: the reviewer cannot confidently judge it
- `bad_question`: the card itself is confusing or not answerable
- `skip`: the reviewer intentionally skipped it

The iOS app can display friendlier labels like Aye, Nay, and Hmm, but the API
still uses these canonical values.

## `GET /health`

Public process liveness check.

Response:

```json
{
  "ok": true,
  "service": "medieval-game-service",
  "version": "0.1.0",
  "uptimeSeconds": 42,
  "checkedAt": "2026-06-23T17:00:00.000Z"
}
```

## `GET /ready`

Public readiness check. Coolify should use this endpoint as the health check.
With Postgres configured, this performs a database query before returning `200`.

Response:

```json
{
  "ok": true,
  "service": "medieval-game-service",
  "version": "0.1.0",
  "uptimeSeconds": 42,
  "checkedAt": "2026-06-23T17:00:00.000Z",
  "database": "reachable"
}
```

## `GET /api/game/profile?reviewer=Davide`

Returns the durable game profile for a reviewer. A missing or blank reviewer is
normalized to `anonymous`.

Response:

```json
{
  "ok": true,
  "profile": {
    "reviewer": "Davide",
    "reviewerKey": "davide",
    "rank": "Page",
    "rankProgress": 0.12,
    "xp": 30,
    "gold": 9,
    "streakDays": 1,
    "totalVerdicts": 3,
    "correctionCount": 1,
    "answerCounts": {
      "yes": 1,
      "no": 1,
      "unsure": 1,
      "badQuestion": 0,
      "skip": 0
    },
    "today": {
      "verdicts": 3,
      "corrections": 1,
      "lowConfidence": 2
    },
    "dailyQuests": [
      {
        "key": "torch_lit",
        "title": "Keep the torch lit",
        "detail": "Judge 10 claims today",
        "progress": 3,
        "target": 10,
        "complete": false
      }
    ],
    "updatedAt": "2026-06-23T17:00:00.000Z"
  }
}
```

## `POST /api/game/verdicts`

Records one game event for a human verdict. This does not replace the listing
eval result API; the iOS app submits eval results to the dashboard and game
events to this service.

`eventId` is the idempotency key. If the same event is retried, the service
returns the current profile without awarding XP or gold again.

Request:

```json
{
  "eventId": "Davide:dailySale:ebyUS:123:component_title_or_label",
  "reviewer": "Davide",
  "cardId": "card-abc123",
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

Response:

```json
{
  "ok": true,
  "duplicate": false,
  "eventId": "Davide:dailySale:ebyUS:123:component_title_or_label",
  "awarded": {
    "xp": 24,
    "gold": 5
  },
  "profile": {}
}
```

Validation rules:

- `cardId` is required
- `answer` must be one of the canonical answer values
- `confidence`, when present, must be between `0` and `1`
- `durationMs`, when present, must be zero or positive
- `correction`, when present, must be an object

## `GET /api/game/leaderboard?limit=25`

Returns profiles ranked by XP, gold, total verdicts, and reviewer name. The
limit is clamped between `1` and `100`.

Response:

```json
{
  "ok": true,
  "leaderboard": [
    {
      "place": 1,
      "reviewer": "Davide",
      "reviewerKey": "davide",
      "rank": "Squire",
      "rankProgress": 0.09,
      "xp": 320,
      "gold": 91,
      "streakDays": 4,
      "totalVerdicts": 28,
      "correctionCount": 6,
      "answerCounts": {
        "yes": 18,
        "no": 7,
        "unsure": 3,
        "badQuestion": 0,
        "skip": 0
      },
      "today": {
        "verdicts": 10,
        "corrections": 2,
        "lowConfidence": 5
      },
      "dailyQuests": [
        {
          "key": "torch_lit",
          "title": "Keep the torch lit",
          "detail": "Judge 10 claims today",
          "progress": 10,
          "target": 10,
          "complete": true
        }
      ],
      "updatedAt": "2026-06-23T17:00:00.000Z"
    }
  ]
}
```
