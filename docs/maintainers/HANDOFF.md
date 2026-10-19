# MediEval Handoff

Maintainer reference for transferring a checkout or building offline handoff
bundles. New users should start with [Self-Hosting](../SELF_HOSTING.md).

## What Is In This Repo

- `ios/ListingEvalApp.xcodeproj`: the iOS app project. The installed app displays as `MediEval`.
- `docs/`: generic eval backend contract, card schema, adapter guide, verification, and handoff notes.
- `game-service/`: the optional Postgres-backed game mechanics service.
- `scripts/demo-server.mjs`: local demo backend for trying the app without a custom backend or Coolify.
- `scripts/preflight.sh`: local verification for the app, game service, demo backend, and bundles.
- `dist/MediEval-iOS-*.zip`: clean iOS handoff bundle after `npm run bundle`.
- `dist/MediEvalGameService-*.zip`: clean game-service handoff bundle when `game-service` exists.

## Fast Local Check

From the repo root:

```bash
./scripts/preflight.sh
```

For the strongest local package check:

```bash
MEDIEVAL_RUN_BUNDLE_VERIFY=1 ./scripts/preflight.sh
```

## Try The App With No External Services

First, prove the bundled demo flow:

```bash
npm run demo:smoke
```

This starts a temporary demo backend, submits one eval, verifies the reviewed card
does not reappear in the pending deck, and checks demo guild rewards.

Start the demo backend:

```bash
npm run demo
```

In the iOS Simulator, tap `Use Local Demo`, or enter:

- Eval backend URL: `http://127.0.0.1:5199`
- Guild name: your reviewer name
- Royal seal: `demo-token`
- Guild backend URL: `http://127.0.0.1:5199`
- Guild backend token: `demo-token`

On a physical iPhone, run `npm run demo:lan` and use the Wi-Fi URL it prints.
The `Use Local Demo` button fills the demo tokens and reviewer on device, but it
does not keep `127.0.0.1` because that would point to the phone itself.

## Prove An External Eval Adapter

MediEval's repo does not include company-specific analysis adapters. The
listing-analysis adapter should live with the analyzer/scraper project that
produces those cards.

To prove an external adapter and the game service together:

```bash
MEDIEVAL_EVAL_ADAPTER_DIR=/path/to/eval-adapter npm run local:integration
```

That starts temporary local instances of the external adapter and the game
service, then runs the same eval-plus-guild write smoke used for deployed
services.

## Prove The iOS App On A Full-Xcode Mac

```bash
npm run simulator:smoke
```

This builds, installs, and launches MediEval in an available iOS Simulator.
To launch directly into working demo cards, use:

```bash
MEDIEVAL_SIMULATOR_SCREENSHOT=/tmp/medieval-demo.png npm run simulator:demo-smoke
```

That starts the bundled Local Demo backend, seeds the Simulator with demo
settings, and saves a screenshot when `MEDIEVAL_SIMULATOR_SCREENSHOT` is set.

Optional:

```bash
MEDIEVAL_SIMULATOR_NAME="iPhone 16" npm run simulator:smoke
MEDIEVAL_SIMULATOR_SCREENSHOT=/tmp/medieval.png npm run simulator:smoke
```

## Use GitHub As A Bridge

Push this repo:

```bash
git remote set-url origin git@github.com:<you>/<repo>.git
git push -u origin main
```

Then open GitHub Actions and inspect `MediEval iOS`. A green workflow proves the
project builds, installs, launches in Simulator against the bundled demo
backend, and produces both a screenshot artifact and clean handoff zips.

## Deploy The Game Service

Use the `game-service/` folder or the `MediEvalGameService-*.zip` bundle.

In Coolify:

- create a Postgres database
- create an app from this repo
- set the app base directory to `/game-service`
- use the included `Dockerfile`
- set health check path to `/ready`

Required environment variables:

```text
PORT=8080
DATABASE_URL=<Coolify Postgres internal connection string>
MEDIEVAL_GAME_TOKEN=<long random shared secret>
MEDIEVAL_ALLOW_UNAUTHENTICATED=false
CORS_ORIGIN=*
```

After deploy, smoke test it from `game-service/`:

```bash
MEDIEVAL_GAME_BASE_URL=https://your-service.example.com \
MEDIEVAL_GAME_TOKEN=<same value as Coolify MEDIEVAL_GAME_TOKEN> \
npm run smoke
```

The smoke proves `/ready`, auth enforcement, verdict write, duplicate protection,
leaderboard, and reward scoring.

## Connect A Real Eval Backend

Start an eval backend with `EVAL_MOBILE_TOKEN` set. In the app, use:

- Eval backend URL: your backend URL
- Royal seal: the same `EVAL_MOBILE_TOKEN`
- Guild backend URL: your Coolify game-service URL, optional but recommended
- Guild backend token: the same `MEDIEVAL_GAME_TOKEN`

Paste the service root URL when possible. If you paste an admin page,
Coolify page, or API endpoint, the app trims the path/query and uses the host as
the service root.

Then prove both deployed services together:

```bash
MEDIEVAL_DASHBOARD_BASE_URL=https://your-eval-backend.example.com \
EVAL_MOBILE_TOKEN=<shared-eval-token> \
MEDIEVAL_GAME_BASE_URL=https://your-game-service.example.com \
MEDIEVAL_GAME_TOKEN=<shared-game-token> \
npm run live:smoke
```

Add `MEDIEVAL_LIVE_WRITE_SMOKE=1` to write one eval verdict and paired guild
reward as a full deployment smoke.

For full verification details, see `VERIFY.md`.
