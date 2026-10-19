# Self-Hosting

Choose the standalone API for a personal/shared-token setup, or the account
platform for individual sign-in, workspace permissions, and assigned batches.
The website's browser sample is separate from either installation.

See the [product guide](README.md) and [operations](OPERATIONS.md) for the full
workflow, including quality policy, exports, and matched database/file backups.

## Prerequisites

- Node.js 22 or later and npm.
- A Mac with full Xcode only if you want the native iOS app.
- PostgreSQL and SMTP only for a deployed account platform.

From a fresh checkout:

```bash
git clone https://github.com/davidedicillo/medieval-core.git
cd medieval-core
npm ci
```

## Try The Browser Demo

```bash
npm run demo:web
```

Open the URL printed by the command, normally `http://127.0.0.1:5182`.
The dashboard includes sample batches and a **Review Cards** browser reviewer.
It uses the actual standalone API and stores its data in `.runtime/web-demo`.
Restarting preserves reviews. Set `MEDIEVAL_WEB_DEMO_DATA_DIR` to a new directory
for a fresh demo, or `MEDIEVAL_WEB_DEMO_PORT` to change its port.

The seeded MyFireRating and catalog batches are synthetic examples. For a
generic answer-grounding batch, follow the [worked example](ANSWER_GROUNDING.md).
The demo binds to loopback with no token; keep it local.

## Run An Empty Standalone Dashboard

Set `EVAL_MOBILE_TOKEN` to a long, random secret in your environment, then run:

```bash
npm run eval-api
```

Open `http://127.0.0.1:5182`. Use the dashboard's token field for protected API
requests. Standalone data lives under `.runtime/medieval-eval`, or the directory
set by `MEDIEVAL_EVAL_DATA_DIR`. Choose a different `PORT` if another demo is
already using 5182.

Use **Create Batch** to enter a project and batch, upload CSV/JSON/JSONL, choose
an adapter, preview cards, and import. The [worked example](ANSWER_GROUNDING.md)
covers meaningful inputs and exports; [Eval API](EVAL_API.md) is the endpoint
reference.

The shared token is not a per-user access model. Anyone with that token has
access to the standalone service. Do not use it where reviewers need different
permissions; choose the account platform instead.

## Accounts And Assigned Batches

```bash
npm run demo:accounts
```

This starts a local platform at `http://127.0.0.1:5183` with a development email
inbox. PostgreSQL binaries or a `DATABASE_URL` are required. Create a workspace,
project, and batch, publish it, then invite a reviewer. The web and iOS clients
show only batches available to the signed-in person.

For a deployed service, use the
[production deployment section](ACCOUNTS.md#deployment) in Accounts. It lists
the PostgreSQL, authentication, SMTP, origin, proxy, and rate-limit settings.
The development inbox must not be enabled on a public deployment.

## Connect An iPhone

For account sign-in and standalone URL/token setup, follow
[iOS setup](../ios/README.md). On a physical phone, `127.0.0.1` refers to the
phone, not your Mac. Use an HTTPS deployment or an explicitly LAN-bound local
server on the same trusted network. Do not expose a tokenless demo publicly.

## Before Internet Deployment

- Terminate HTTPS and keep authentication enabled.
- Restrict origins and configure trusted proxies as documented in Accounts.
- Back up the standalone data directory or the platform PostgreSQL database
  and any media storage; test restoring it.
- Keep tokens, SMTP credentials, database URLs, and customer data out of Git.
- Verify real email delivery and reviewer permissions before inviting a team.

Labels are evaluation data; optional game rewards are a separate service.
