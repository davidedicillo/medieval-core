# Eval API

The self-hosted server in `services/eval-api` implements the community eval API
used by the iOS app and the dashboard.

## Setup

Follow [Self-Hosting](SELF_HOSTING.md) for installation, standalone tokens,
runtime data paths, and account-platform deployment. This page is the API
reference for the standalone service; the account platform has its own
[authenticated routes](ACCOUNTS.md#api).

## Auth

If `EVAL_MOBILE_TOKEN` or `MEDIEVAL_EVAL_API_TOKEN` is set, API requests must
send either:

```text
Authorization: Bearer <token>
x-eval-mobile-token: <token>
```

With no token, the service is open for local personal use only.

## Mobile Routes

```text
GET  /api/mobile/eval/cards?projectId=<id>&batchId=<id>&reviewer=<name>&limit=20&page=1&reviewState=unreviewed
POST /api/mobile/eval/results?projectId=<id>&batchId=<id>
GET  /api/mobile/eval/summary?projectId=<id>&batchId=<id>&reviewer=<name>
```

`POST /api/mobile/eval/results` accepts the payload documented in
`docs/CARD_SCHEMA.md`. `eventId` is the primary idempotency key. Older clients
without `eventId` fall back to reviewer, card ID, and client timestamp.

## Dashboard Routes

```text
GET  /api/eval/projects
POST /api/eval/projects
GET  /api/eval/batches?projectId=<id>&reviewer=<name>
POST /api/eval/batches
GET  /api/eval/batches/detail?projectId=<id>&batchId=<id>&reviewer=<name>
POST /api/eval/cards/preview
POST /api/eval/cards/import
GET  /api/eval/dashboard/state
GET  /api/eval/results/export?format=jsonl|csv
```

`POST /api/eval/cards/preview` turns source records into eval cards before they
are imported. It accepts either raw text:

```json
{
  "projectId": "personal",
  "batchId": "fire-risk-june",
  "adapter": "myfire-rating",
  "format": "csv",
  "raw": "propertyId,address,fireRiskRating,..."
}
```

or parsed records:

```json
{
  "projectId": "personal",
  "batchId": "generic-claims",
  "adapter": "generic",
  "records": [{ "question": "Is this value correct?", "value": "High" }]
}
```

The response includes `recordsPreview`, generated `cards`, and adapter warnings.

`POST /api/eval/cards/import` accepts either:

- JSON: `{ "projectId": "default", "batchId": "default", "replace": true, "cards": [...] }`
- JSONL body with `content-type: application/x-ndjson`

Accepted labels are appended to `results.jsonl`. Exports are generated from
that durable file.

The bundled dashboard uses these routes for the OSS Core loop: create project,
create batch, upload CSV/JSONL, preview generated cards, confirm import, inspect
labels, and export JSONL/CSV.

Legacy `runId` query/body fields and `POST /api/eval/runs` remain accepted as
aliases for older clients.
