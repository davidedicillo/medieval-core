# MediEval Core

MediEval Core is the Apache-2.0 licensed foundation for the MediEval human-eval
platform: the iOS reviewer, account-based web platform, self-hosted eval API,
optional Postgres-backed game service, and shared eval protocol.

This repository is independently usable and self-hostable. The managed service
at [medieval.dev](https://medieval.dev) uses the same core, with its deployment
configuration and future commercial extensions maintained separately. See
[the open-core boundary](docs/OPEN_CORE.md).

```text
.
├── ios/                 # Xcode project, SwiftUI app source, and app assets
├── game-service/        # XP, gold, streaks, quests, profiles, leaderboard
├── services/eval-api/   # Self-hosted eval dashboard/API and JSONL labels
├── services/platform/   # Accounts, workspaces, invitations, and batch discovery
├── packages/            # Shared card schema and CLI helpers
├── docs/                # Handoff, verification, schema, and adapter notes
├── examples/            # Sample eval cards and MyFireRating CSV data
└── scripts/             # Monorepo smoke, bundle, and verification scripts
```

## Accounts And Assigned Batches

```bash
npm install
npm run demo:accounts
```

Open `http://127.0.0.1:5183` and the linked development inbox. Create a workspace
and project, upload a batch, publish it, and invite reviewers by email. The web
reviewer and iOS app list only batches available to the signed-in person, with
recognizable names and individual progress. The local demo starts a separate
PostgreSQL instance and requires PostgreSQL binaries or `DATABASE_URL`.

The deployed account platform uses `npm run platform`, PostgreSQL, Better Auth,
and SMTP. See [account setup and deployment](docs/ACCOUNTS.md).

## Local Web Demo

```bash
npm run demo:web
```

Open the URL printed by the command (normally `http://127.0.0.1:5182`). The
dashboard starts with MyFireRating and catalog batches, sample labels, and
exports. Choose **Review Cards** to submit answers, corrections, and notes from
your browser. Those reviews appear in the dashboard and JSONL/CSV exports.
Download the sample CSV or JSONL from the review screen to try **Create Batch**.

The demo uses the real eval API and persists its separate data under
`.runtime/web-demo`. Restarting preserves your reviews and does not reseed.
Set `MEDIEVAL_WEB_DEMO_DATA_DIR` to a new directory for a fresh demo, or
`MEDIEVAL_WEB_DEMO_PORT` to choose a port. By default it binds to loopback with
no token. The iOS app can use the same URL, reviewer `Davide`, project
`myfire-rating`, batch `property-review`, and an empty token.

Verify the demo with `npm run demo:web:smoke`. The existing `npm run demo`
command continues to run the iOS demo with simulated guild rewards.

## iOS App

Open:

```bash
open ios/ListingEvalApp.xcodeproj
```

MediEval reviews generic binary eval cards. The original sold-listing workflow
is now one adapter example, not the only data model. Cards should use generic
`subject` and `media` fields; legacy sold-listing backends can continue sending
`listing` and `images`.

For a new backend integration, start with:

- `docs/INTEGRATION.md`
- `docs/CARD_SCHEMA.md`
- `docs/ADAPTER_GUIDE.md`
- `docs/EVAL_API.md`
- `docs/SELF_HOSTING.md`

## Self-Hosted Eval Core

Run the open-source dashboard/API:

```bash
EVAL_MOBILE_TOKEN=dev-token npm run eval-api
```

Open `http://127.0.0.1:5182`, create a project and batch, upload CSV/JSONL, then
preview and import generated eval cards. Point the iOS app at the same URL and
token to review the batch. Accepted labels are stored as durable JSONL under
`.runtime/medieval-eval`.

The bundled dashboard covers the core loop:

- create projects and batches
- upload CSV, JSON, or JSONL source data
- preview generated cards before import
- review the batch from the iOS app
- inspect labels, corrections, source context, event IDs, and duplicate status
- export durable JSONL/CSV human labels

For a realistic first adapter, upload `examples/myfire-rating.csv` in **Create
Batch** and choose `MyFireRating`. The adapter turns each property/fire-risk row
into review cards for rating correctness, explanation/evidence support, and
mitigation recommendation.

You can also import existing eval-card JSONL from the terminal:

```bash
node packages/cli/medieval-eval.mjs import \
  --base-url http://127.0.0.1:5182 \
  --token dev-token \
  --project personal \
  --batch first-batch \
  --replace \
  --file examples/cards.jsonl
```

To verify the self-hosted loop:

```bash
npm run eval-api:smoke
```

The open-source core includes the iOS reviewer app, eval API contract,
self-hosted dashboard/API, JSONL persistence, import/export helpers, examples,
and smoke tests. Future paid layers should live above that core: hosted
reliability, teams, quality workflows, enterprise controls, and managed reviewer
supply. See `docs/OPEN_CORE.md`.

## Game Service

The optional game service powers durable XP, gold, streaks, quests, profiles,
and leaderboard data. If it is not configured, the app still submits eval
results and keeps local progress on-device.

For Coolify, use:

- **Base Directory:** `/game-service`
- **Dockerfile:** `Dockerfile`
- **Health check path:** `/ready`

See `game-service/docs/COOLIFY.md`.

## External Eval Adapters

MediEval does not own company-specific analysis pipelines. Those live in the
producer's repo and act as eval adapters by exposing the mobile eval endpoints:

- `GET /api/mobile/eval/cards`
- `POST /api/mobile/eval/results`
- `GET /api/mobile/eval/summary`

The current listing-analysis adapter belongs with the analyzer/scraper project,
not inside this repo. To run MediEval's optional local integration smoke against
an external adapter, point `MEDIEVAL_EVAL_ADAPTER_DIR` at that adapter repo.

## Verification

Run the full local preflight from the repo root:

```bash
npm run preflight
```

Create and verify handoff bundles:

```bash
npm run bundle
npm run bundle:verify
npm run bundle:smoke
```

See `docs/VERIFY.md` for the longer checklist and `docs/HANDOFF.md` for moving
the app/server to another machine.
