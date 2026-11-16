# MediEval Integration Guide

MediEval is a reusable iOS review app for human eval queues. Your backend owns
the data, auth, result storage, and optional batch selection. The app owns the
mobile review workflow, offline retry, and optional game/reward sync.

## Required Backend API

Serve these routes from one HTTPS service, or from a local HTTP service while
using the Local Demo flow:

```text
GET  /api/mobile/eval/cards?reviewer=<name>&limit=20&page=1&reviewState=unreviewed&batchId=<optional>
GET  /api/mobile/eval/summary?reviewer=<name>&batchId=<optional>
POST /api/mobile/eval/results?batchId=<optional>
```

All routes must accept `Authorization: Bearer <token>` and return JSON. The
bundled demo server also accepts `x-eval-mobile-token` for browser-style smoke
tests, but new integrations should use the bearer token.

## Batch ID

`batchId` is an optional review-batch selector. Use it for a dataset, import,
experiment, prompt version, model output sample, or any other specific queue. If
omitted, the backend should choose its active/default queue.

The self-hosted dashboard accepts both `batchId` and legacy `runId`; prefer
`batchId` for new integrations. Result submissions include the selected batch in
the query string and JSON body when one is set, so queued offline results retry
against the same eval batch that created them.

## Minimal Response Shape

Cards response:

```json
{
  "ok": true,
  "cards": [],
  "page": 1,
  "pageSize": 20,
  "pageCount": 1,
  "total": 0,
  "unfilteredTotal": 0,
  "reviewer": "Davide",
  "reviewState": "unreviewed"
}
```

Summary response:

```json
{
  "ok": true,
  "summary": {
    "batchId": "demo-2026-06-24",
    "runId": "demo-2026-06-24",
    "reviewer": "Davide",
    "totalCards": 0,
    "reviewedCards": 0,
    "pendingCards": 0,
    "totalResultRows": 0,
    "lastReviewedAt": null,
    "byPriority": {}
  }
}
```

Result response:

```json
{
  "ok": true,
  "duplicate": false
}
```

## Backend Responsibilities

- Return stable `cardId` values within a batch.
- Treat `eventId` as the result idempotency key.
- Hide reviewed cards for the same reviewer/batch when `reviewState=unreviewed`.
- Return a 4xx for permanent problems such as invalid tokens or unknown cards.
- Return a 429 or 5xx for retryable failures; the app queues those locally.

## Local Validation

Run the bundled demo smoke:

```bash
npm run demo:smoke
```

Run the full local app contract check:

```bash
./scripts/preflight.sh
```

## Account-platform service integrations

Operators can set `MEDIEVAL_INTEGRATIONS_FILE` to a private JSON file containing an array of `{id, tokenHash, projectId, ownerId, reviewerIds}`. Use a random bearer secret and store only its SHA-256 hexadecimal hash on the platform. IDs must refer to an existing project, its current manager, and verified reviewer accounts. The service rechecks manager access on every request. The token cannot sign in, create invitations, or submit human judgments. Integration calls reject browser Origin headers.

Preview cards with `POST /api/integrations/{id}/batches/{externalKey}/preview`, then PUT the same path without `/preview` with `{name, description, rubric, rubricVersion, cards}`. Each request accepts 1–200 canonical cards. Batch identity is deterministic; identical retries append no duplicates. Existing card payloads and rubric policies are immutable: changed evidence needs a new card ID; changed policy needs a new batch key. Provisioning gives configured reviewers guest access to assigned batches only, uses solo expert review, and sends no email. Later imports preserve a manager's paused status. Run a single platform writer against the file store.

Read `/results` for resolved labels and authenticated reviewer provenance. Do not treat unreviewed, unresolved or superseded labels as corrections. POST `/retire` with `{cardIds}` to remove superseded evidence from review decks and current labels without erasing its history. Publication and reviewer access are authorized by the integration's operator configuration; the producer must still preview actual cards before importing. There is no automatic master-data write.

The bridge smoke test (`npm run integration:smoke`) exercises scope, real authenticated reviews, immutable retry, retirement and interrupted provisioning recovery against an isolated PostgreSQL database.
