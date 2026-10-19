# API reference

The [machine route catalog](agent/api.json) gives stable operation IDs, service scope, request fields, responses, side effects, and retry rules. [schemas.json](agent/schemas.json) supplies recommended client payload contracts; runtime validation may accept additional compatibility forms. [examples.json](agent/examples.json) contains synthetic data. This guide covers the platform and file-backed eval server; the optional [game API](../game-service/docs/API.md) is separate.

## Authentication and context

| Service | Authentication | Reviewer and batch context |
| --- | --- | --- |
| Account platform | Browser HttpOnly session cookie, or `Authorization: Bearer <signed-session-token>` | Identity from session; required query `batchId` (legacy `runId` accepted); optional project/workspace must match |
| Shared-token eval server | `Authorization: Bearer <configured-token>` or `x-eval-mobile-token` | Explicit query `projectId`, `batchId`, `reviewer`; names are not verified identity |
| Documentation / health | Public read | No customer records or reference answers |

Account browser writes require same-origin `Origin`. Bearer writes can omit Origin; if present, it must match. Send JSON with `Content-Type: application/json`. The account server limits JSON request bodies to 2 MB. IDs in path parameters must be URL encoded. Query fields must be encoded with `URLSearchParams` or an equivalent library.

`GET /healthz` returns `{ "ok": true, "service": "medieval-platform" }` or `medieval-eval-api`. It is a liveness signal, not a complete dependency or deployment-capability check. Account `/api/me` and shared-token `/api/eval/projects` are distinct discovery APIs.

## Account operations

| Method and route | Request / result |
| --- | --- |
| `POST /api/auth/email-otp/send-verification-otp` | `{email,type:"sign-in"}`; sends a code, subject to rate limits |
| `POST /api/auth/sign-in/email-otp` | `{email,otp,name?}`; creates/signs into account; native clients retain signed `set-auth-token` response header |
| `POST /api/auth/sign-out` | Revoke current session |
| `GET /api/me` | `user`, `workspaces`, pending `invitations` |
| `GET /api/me/batches` | `batches` visible for active review, with your progress |
| `GET /api/platform/state` | Management-visible `workspaces`, `projects`, `batches`, plus identity and invitations |
| `POST /api/platform/workspaces` | `{name}` → `workspace` |
| `POST /api/platform/projects` | `{workspaceId,name}` → `project` |
| `POST /api/platform/preview` | `{projectId,adapter,format,raw}` or `{projectId,adapter,records}` → `cards`, `warnings`, `cardCount` |
| `POST /api/platform/batches` | Preview input plus `name`, optional `description`, `audience` → draft `batch`, `cardCount` |
| `GET /api/platform/batches/{id}` | Manager `batch` and `detail` including results |
| `POST /api/platform/batches/{id}` | `{status?,audience?}` → updated `batch` |
| `GET /api/platform/batches/{id}/members` | Direct `members` and batch `invitations` |
| `POST /api/platform/invitations` | `{workspaceId,email,role?,batchId?}` → safe `invitation`, secret `inviteUrl`; sends email |
| `POST /api/invitations/accept` | `{token}` or `{invitationId}`; requires verified intended recipient |
| `POST /api/platform/invitations/{id}/revoke` | Revoke pending invitation |
| `POST /api/platform/batches/{id}/access` | `{userId}` removes direct assignment |
| `GET /api/platform/workspaces/{id}/members` | Manager membership list |
| `POST /api/platform/workspaces/{id}/members/{userId}` | Remove membership subject to role restrictions |

API publication values are `draft`, `active`, `paused`, `archived`; audiences are `invited` and `workspace`. Names are required and capped at 200 characters. Project/batch IDs are returned by the server. Invitation role is `reviewer` or owner-authorized `admin` for workspace invitations; batch invitations become `guest`. Read [permissions](WORKSPACES.md) before granting or removing access.

## Review operations on both services

| Method and route | Behavior |
| --- | --- |
| `GET /api/mobile/eval/cards` | Reviewer deck; `limit`, `page`; may include a quality quest |
| `GET /api/mobile/eval/summary` | `summary` of current production progress for context |
| `POST /api/mobile/eval/results` | Persist production judgment or quality attempt |
| `GET /api/eval/results/export?format=jsonl` | Raw production judgments, filtered by account permissions |

Supply batch context as query parameters. The shared-token deck additionally supports `reviewState`; the account deck uses its pending-review default. A deck response includes `cards` and pagination/count fields. Production cards carry `reviewRubric.version` and `reviewRubric.text`; quality cards carry `quality.rubricVersion` and `quality.rubric`. A successful result includes `ok`, `stored`, and `duplicate`; quality submissions additionally return `qualityFeedback`. Check status and body instead of assuming every 200 creates a new event.

Recommended production result body:

```json
{
  "eventId": "client-generated-unique-id-001",
  "cardId": "catalog:color-round-1:catalog:001:claim",
  "reviewer": "expert-1",
  "answer": "yes",
  "rubricVersion": "1",
  "notes": "The source explicitly says blue.",
  "durationMs": 4200,
  "clientGeneratedAt": "2026-10-19T12:00:00.000Z"
}
```

Use the actual returned card ID and rubric version. The account server ignores supplied reviewer identity and derives it from the session. Shared-token mode requires a reviewer in the body; keep it equal to query context. Accepted answers are `yes`, `no`, `unsure`, `bad_question`, and `skip`. Correction shape is `{ "correctAnswer": "red", "reasonTags": ["wrong_value"] }`.

Account submissions require `eventId` (at most 200 characters). Persist it and reuse it for retries of the same body. Shared-token legacy clients may omit it and fall back to reviewer/card/client timestamp, but new clients should always supply it. A production submission with a stale provided `rubricVersion` receives 409. A `quality:` ID routes to a separate assignment attempt; submit exactly the virtual ID provided to that reviewer.

## Quality operations on both services

All routes require batch context. Account manager routes require owner/admin; mobile routes expose only the current reviewer's view. The shared token acts as operator authorization.

| Method and route | Request / response |
| --- | --- |
| `GET /api/mobile/eval/quality` | Own settings, qualification, quality XP, feedback, `qualificationRequired`, `isProjectExpert` |
| `GET /api/mobile/eval/quality/cards?kind=practice` | `cards`; kind is practice/qualification/check/consistency; fetching can persist an assignment |
| `GET /api/eval/quality` | Manager snapshot including references, labels, settings history, reviewer quality |
| `POST /api/eval/quality/settings` | Partial settings update → saved settings |
| `POST /api/eval/quality/references` | `{cardId,kind,answer,explanation}` or full `card` → reference |
| `POST /api/eval/quality/references/retire` | `{id}` → retirement; can invalidate qualification |
| `POST /api/eval/quality/adjudications` | `{cardId,answer,rationale,basisEventIds,correction?}` → adjudication |
| `GET /api/eval/quality/export?format=jsonl` | Current resolved-label JSONL; `format=csv` also supported |

Settings and limits are in [schemas.json](agent/schemas.json); defaults and workflows are in [quality guide](QUALITY.md). References need an explanation and a non-skip expected answer. Adjudication requires the exact current event basis in its returned order and at least one judgment. Refresh on conflict. GET quality cards is assignment-producing and must not be treated as a purely observational crawl.

## Shared-token management operations

These routes are not available on the account platform:

| Method and route | Purpose |
| --- | --- |
| `GET/POST /api/eval/projects` | List or create/update project metadata |
| `GET/POST /api/eval/batches` | List summaries or create/update batch metadata |
| `GET /api/eval/batches/detail` | Inspect batch, cards, and results |
| `POST /api/eval/cards/preview` | Generate source-record preview with warnings |
| `POST /api/eval/cards/import` | Import canonical cards from JSON envelope or NDJSON |
| `GET /api/eval/dashboard/state` | Dashboard context, projects, batches, cards, and results |

Import envelope: `{projectId,batchId,cards,replace?}`. `replace` changes the deck, not the full history. Preview accepts `{projectId,batchId,adapter,records}` or `{projectId,batchId,adapter,format,raw}`. `POST /api/eval/runs` is a legacy batch alias.

## Runnable shared-token example

Start `EVAL_MOBILE_TOKEN=dev-token npm run eval-api` in one terminal. In another, import the bundled synthetic cards:

```bash
node packages/cli/medieval-eval.mjs import \
  --base-url http://127.0.0.1:5182 --token dev-token \
  --project catalog --batch color-round-1 --file examples/cards.jsonl
curl --fail-with-body \
  -H 'Authorization: Bearer dev-token' \
  'http://127.0.0.1:5182/api/mobile/eval/cards?projectId=catalog&batchId=color-round-1&reviewer=expert-1'
```

Inspect the returned card before judging it. Do not submit the example result's hard-coded ID against a different dataset. Use web export or the [CLI export](EXPORTING.md) to confirm durable results.

## Errors

Application errors generally return an `error` string with non-2xx status; auth-provider errors may use `message` and `code`. Handle status before parsing success fields. Expect 400 invalid input, 401 missing authentication, 403 access/qualification/origin gate, 404 unavailable route/resource, 409 stale/conflicting state, 413 account body too large, and 429 authentication rate limiting. See [agent retry rules](AGENTS.md) and [troubleshooting](TROUBLESHOOTING.md).
