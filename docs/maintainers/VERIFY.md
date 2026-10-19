# MediEval Verification

Use this checklist when moving MediEval to another Mac, deploying the game
service, or deciding whether the current build is ready to use for real evals.

## 0. Preflight

From the repo root:

```bash
./scripts/preflight.sh
```

The preflight validates the app files, installs service dependencies when
needed, runs the self-hosted eval API checks, and runs the game service checks
when present. External eval-adapter checks are opt-in with
`MEDIEVAL_EVAL_ADAPTER_DIR`. It skips checks that require missing local tools or
live URLs.

For the iOS project package check by itself:

```bash
npm run verify:xcode
tmp="${TMPDIR:-/tmp}/medieval-url-smoke-$$"
xcrun swiftc ios/ListingEvalApp/Models.swift ios/ListingEvalApp/APIClient.swift scripts/url-normalization-smoke.swift -o "$tmp" && "$tmp"
rc=$?
rm -f "$tmp"
exit $rc
```

For the Swift reward-scoring contract by itself:

```bash
tmp="${TMPDIR:-/tmp}/medieval-reward-smoke-$$"
xcrun swiftc ios/ListingEvalApp/Models.swift scripts/reward-scoring-smoke.swift -o "$tmp" && "$tmp"
rc=$?
rm -f "$tmp"
exit $rc
```

For the Swift app/API payload contract by itself:

```bash
tmp="${TMPDIR:-/tmp}/medieval-payload-smoke-$$"
xcrun swiftc ios/ListingEvalApp/Models.swift ios/ListingEvalApp/APIClient.swift scripts/payload-contract-smoke.swift -o "$tmp" && "$tmp"
rc=$?
rm -f "$tmp"
exit $rc
```

For the deck paging/no-repeat guard by itself:

```bash
tmp="${TMPDIR:-/tmp}/medieval-deck-paging-smoke-$$"
xcrun swiftc ios/ListingEvalApp/Models.swift scripts/deck-paging-smoke.swift -o "$tmp" && "$tmp"
rc=$?
rm -f "$tmp"
exit $rc
```

For setup validation by itself:

```bash
tmp="${TMPDIR:-/tmp}/medieval-settings-smoke-$$"
xcrun swiftc ios/ListingEvalApp/Models.swift ios/ListingEvalApp/APIClient.swift ios/ListingEvalApp/OutboxStore.swift ios/ListingEvalApp/ContentView.swift scripts/settings-validation-smoke.swift -o "$tmp" && "$tmp"
rc=$?
rm -f "$tmp"
exit $rc
```

For the Swift outbox durability contract by itself:

```bash
tmp="${TMPDIR:-/tmp}/medieval-outbox-smoke-$$"
xcrun swiftc ios/ListingEvalApp/Models.swift ios/ListingEvalApp/APIClient.swift ios/ListingEvalApp/OutboxStore.swift scripts/outbox-storage-smoke.swift -o "$tmp" && "$tmp"
rc=$?
rm -f "$tmp"
exit $rc
```

For the self-hosted open-source eval API by itself:

```bash
npm run eval-api:smoke
```

That starts a temporary dashboard/API, imports `examples/cards.jsonl`, fetches
mobile cards, submits a result, proves duplicate `eventId` protection, checks
pending-card hiding, and exports JSONL/CSV labels.

This does not replace a simulator build, but it catches missing source files,
asset catalog drift, plist drift, a missing shared scheme, URL setup
normalization, reviewer setup validation, app/API payload drift,
reward-scoring, queued-verdict storage regressions, or self-hosted eval API
regressions on machines that do not have full Xcode installed.

To include a real simulator build, run it on a Mac with full Xcode installed:

```bash
MEDIEVAL_RUN_XCODE_BUILD=1 ./scripts/preflight.sh
```

The build check defaults to `generic/platform=iOS Simulator`, which is more
portable across fresh Macs and GitHub runners. Set `MEDIEVAL_XCODE_DESTINATION`
only when you need a specific simulator destination.

To prove the app can also install and launch in Simulator:

```bash
MEDIEVAL_RUN_XCODE_LAUNCH=1 ./scripts/preflight.sh
```

Or run the launch smoke by itself:

```bash
npm run simulator:smoke
```

Set `MEDIEVAL_SIMULATOR_NAME="iPhone 16"` to choose a specific simulator, or
`MEDIEVAL_SIMULATOR_SCREENSHOT=/tmp/medieval.png` to save a screenshot after
launch.

For a stronger Simulator proof, launch against the bundled Local Demo backend:

```bash
MEDIEVAL_SIMULATOR_SCREENSHOT=/tmp/medieval-demo.png npm run simulator:demo-smoke
```

This starts `scripts/demo-server.mjs`, passes a smoke-only Local Demo flag into
the app process, fills the eval/guild URLs with `http://127.0.0.1:5199`,
and gives the screenshot a short delay so the first eval card can render.

To smoke test live services too:

```bash
MEDIEVAL_DASHBOARD_BASE_URL=https://your-eval-backend.example.com \
EVAL_MOBILE_TOKEN=<shared-eval-token> \
MEDIEVAL_GAME_BASE_URL=https://your-game-service.example.com \
MEDIEVAL_GAME_TOKEN=<shared-game-token> \
MEDIEVAL_RUN_LIVE_SMOKE=1 \
MEDIEVAL_RUN_XCODE_BUILD=1 \
MEDIEVAL_RUN_XCODE_LAUNCH=1 \
MEDIEVAL_SIMULATOR_USE_LOCAL_DEMO=1 \
./scripts/preflight.sh
```

You can run the combined live service check by itself:

```bash
MEDIEVAL_DASHBOARD_BASE_URL=https://your-eval-backend.example.com \
EVAL_MOBILE_TOKEN=<shared-eval-token> \
MEDIEVAL_GAME_BASE_URL=https://your-game-service.example.com \
MEDIEVAL_GAME_TOKEN=<shared-game-token> \
npm run live:smoke
```

`MEDIEVAL_DASHBOARD_BASE_URL` is the legacy environment variable name for the
eval backend URL.

Before deploying, the local equivalent is:

```bash
MEDIEVAL_EVAL_ADAPTER_DIR=/path/to/eval-adapter npm run local:integration
```

That starts a temporary external eval adapter fixture and a temporary in-memory
game service, then runs the same integration smoke in write mode.

By default this is read-only: it checks eval summary/cards and game
profile/leaderboard/auth. To prove the full deployed loop, explicitly enable one
write:

```bash
MEDIEVAL_DASHBOARD_BASE_URL=https://your-eval-backend.example.com \
EVAL_MOBILE_TOKEN=<shared-eval-token> \
MEDIEVAL_GAME_BASE_URL=https://your-game-service.example.com \
MEDIEVAL_GAME_TOKEN=<shared-game-token> \
MEDIEVAL_LIVE_WRITE_SMOKE=1 \
MEDIEVAL_EVAL_REVIEWER="MediEval Live Smoke" \
npm run live:smoke
```

The write smoke records one eval verdict, sends the paired guild verdict,
verifies duplicate protection on both services, and confirms the written card is
not returned in the eval backend's unreviewed deck.

## 0.5. Release Bundle

To create clean archives for moving MediEval to another machine:

```bash
npm run bundle
npm run bundle:verify
npm run bundle:smoke
```

Pass condition:

- `dist/MediEval-iOS-*.zip` exists
- `dist/MediEvalGameService-*.zip` exists when the `game-service/` folder is present
- archives do not contain `.git`, `node_modules`, `.env`, build products, or
  runtime data; the iOS archive also excludes Xcode user state
- `bundle:smoke` can extract the newest archives and run their package checks
  from inside the extracted copies
- the iOS archive includes `scripts/xcode-simulator-smoke.sh`, so an extracted
  copy can prove build/install/launch on a Mac with full Xcode

To include this in preflight:

```bash
MEDIEVAL_RUN_BUNDLE_VERIFY=1 ./scripts/preflight.sh
```

## 1. Local Demo Backend

From the repo root:

```bash
npm run demo:smoke
```

When `MEDIEVAL_DEMO_BASE_URL` is not set, this starts a temporary local demo
server and proves deck fetch, image fetch, result write, duplicate protection,
no-repeat pending cards, reward scoring, and leaderboard responses.

To manually try the app, start the long-running demo server:

```bash
npm run demo
```

Use these settings in the app:

- Dashboard URL: `http://127.0.0.1:5199`
- Guild name: `Davide` or another reviewer name
- Royal seal: `demo-token`
- Guild backend URL: `http://127.0.0.1:5199`
- Guild backend token: `demo-token`

The app setup screen also has a `Use Local Demo` button that fills these values
in the iOS Simulator.

For a physical iPhone on the same Wi-Fi network, run:

```bash
npm run demo:lan
```

The demo server prints usable URLs. Use your Mac's Wi-Fi URL instead of
`127.0.0.1`; that usually looks like `http://192.168.1.42:5199`. Allow the iOS
Local Network permission prompt when it appears. Deployed eval and guild
backend URLs should use HTTPS. On a physical iPhone, `Use Local Demo` fills the
demo tokens and reviewer, but it leaves loopback URLs blank so you can paste the
Wi-Fi URL.

Terminal smoke test:

```bash
npm run demo:smoke
```

To target the long-running demo server explicitly:

```bash
MEDIEVAL_DEMO_BASE_URL=http://127.0.0.1:5199 npm run demo:smoke
```

Pass condition:

- eval backend connection check succeeds
- guild backend connection check succeeds
- cards show generated PNG images
- Aye/Nay/Hmm/Cursed/Pass submissions move through the deck
- reviewed cards do not reappear in the pending demo deck
- accepted cards stay hidden locally for the same eval backend and reviewer even if fetched again
- Nay with a correction is accepted
- Guild Hall XP/gold and leaderboard update
- a bad eval token leaves the current card in place and shows an error
  instead of sealing an unsendable eval courier
- a bad guild backend token keeps rewards sealed and shows a Settings hint in
  Guild Hall

## 2. External Eval Adapter

MediEval does not include company-specific analysis adapters. Verify those in
the producer repo that owns the data pipeline.

For the current listing-analysis adapter, run from that adapter repo:

```bash
node --check scripts/daily-sales-pipeline-dashboard.mjs
node --test test/daily-sales-pipeline-dashboard.test.mjs
npm run medieval:dashboard:smoke
```

When no live backend URL is set, `npm run medieval:dashboard:smoke` should start
a temporary fixture adapter, check the mobile eval card/summary endpoints, and
verify CORS preflight locally.

To prove the external adapter and MediEval game service together from this repo:

```bash
MEDIEVAL_EVAL_ADAPTER_DIR=/path/to/eval-adapter npm run local:integration
```

That write smoke uses a stable `eventId` per run and reviewer, so retrying the
same write does not append duplicate result rows. After writing, it fetches the
unreviewed deck again and fails if the written card is still offered to that
reviewer.

Manual fallback against any deployed eval backend:

```bash
curl -H "Authorization: Bearer $EVAL_MOBILE_TOKEN" \
  "https://your-eval-backend.example.com/api/mobile/eval/summary?reviewer=Davide"

curl -H "Authorization: Bearer $EVAL_MOBILE_TOKEN" \
  "https://your-eval-backend.example.com/api/mobile/eval/cards?reviewer=Davide&limit=1"
```

Pass condition:

- both commands return JSON with `ok: true`
- the cards response includes at least one card when pending eval work exists
- the optional write smoke returns `writeSmoke.duplicate: false` on first write,
  or `true` on a retry of the same event
- the optional write smoke reports `writeSmoke.repeatedInUnreviewedDeck: false`

## 3. Game Service

From `game-service/`:

```bash
npm run preflight
```

The service preflight runs syntax checks, API contract tests, the in-memory HTTP
smoke, deployment manifest validation, and any deeper checks enabled by your
environment. `smoke:memory` starts the real HTTP API with an in-memory store,
runs the normal game-service smoke client, and shuts it down. It is useful on
Macs without Docker; production still uses Postgres.

To check migrations against a reachable database, set `DATABASE_URL` before
running `npm run preflight`. To also start the API against that same Postgres
database and run the authenticated write smoke:

```bash
DATABASE_URL=postgres://user:password@host:5432/medieval \
MEDIEVAL_RUN_POSTGRES_SMOKE=1 \
npm run preflight
```

That proves migrations, `/ready`, verdict writes, duplicate protection, and
leaderboard reads without requiring Docker.

Local Docker/Postgres run:

```bash
docker compose up --build
```

In another terminal:

```bash
MEDIEVAL_GAME_BASE_URL=http://localhost:8080 \
MEDIEVAL_GAME_TOKEN=local-dev-token \
npm run smoke
```

To include that Docker/Postgres path in the service preflight:

```bash
MEDIEVAL_RUN_DOCKER_SMOKE=1 npm run preflight
```

Coolify run:

```bash
MEDIEVAL_GAME_BASE_URL=https://your-service.example.com \
MEDIEVAL_GAME_TOKEN=<same value as Coolify MEDIEVAL_GAME_TOKEN> \
npm run smoke
```

Pass condition:

- `/ready` reports Postgres reachable
- the smoke script records one verdict
- retrying the same smoke event is duplicate-protected
- the reviewer appears in the leaderboard

## 4. iOS Build

From this `ListingEvalApp` folder on a Mac with full Xcode installed:

```bash
npm run simulator:smoke
```

The script picks a booted iOS Simulator when one exists, otherwise it boots the
first available iOS Simulator, builds the app, installs it, and launches it. If
you want a specific device:

```bash
MEDIEVAL_SIMULATOR_NAME="iPhone 16" npm run simulator:smoke
```

To save a screenshot after launch:

```bash
MEDIEVAL_SIMULATOR_SCREENSHOT=/tmp/medieval.png npm run simulator:smoke
```

Pass condition:

- the simulator reaches booted state
- the Xcode build completes successfully
- `simctl install` accepts the built app
- `simctl launch` starts `com.auctionscrapers.listingeval`

Remote fallback:

- push this folder to GitHub as its own repository
- open the Actions tab
- run or inspect the `MediEval iOS` workflow
- treat a green workflow as remote proof that the demo backend works, the Xcode
  project builds on a clean macOS runner, and the app launches into demo cards
- inspect the simulator screenshot artifact when you want visual confirmation
- download the handoff zip artifact when you want GitHub to carry the clean
  bundle to another machine

## 5. In-App Smoke Test

Run the app in the simulator or on device.

In Settings:

- set Dashboard URL to the eval backend URL
- set Royal seal to `EVAL_MOBILE_TOKEN`
- set Guild backend URL to the game service URL, if using shared rewards
- set Guild backend token to `MEDIEVAL_GAME_TOKEN`
- tap both connection checks

The URL fields accept full `http://` or `https://` URLs. If the scheme is
omitted, MediEval treats localhost and private LAN addresses as `http://`, and
deployed hostnames as `https://`.
If a copied URL includes a page path, API path, query string, or fragment,
MediEval normalizes it back to the service root before making requests.

Review flow:

- open one card
- swipe right from the claim area for Aye, or use the bottom controls
- submit one Nay verdict with a correction
- open Guild Hall
- confirm XP/gold changed locally
- confirm Round Table appears when the game service is configured
- turn off network, submit one card, then use Guild Hall to send sealed couriers after reconnecting

Pass condition:

- eval backend connection check succeeds
- guild backend connection check succeeds when configured
- eval verdicts reach the eval backend
- shared guild rewards update after accepted eval verdicts
- accepted guild reward events queue locally if the guild backend is blank
- transient eval submission failures queue locally, while hard eval-backend
  rejections keep the current card visible with an error
- hard game-service failures keep rewards sealed and show a Settings hint
- queued eval/game events can be retried from Guild Hall

## Checks Without Full Xcode

Parser and service checks can run without a full iOS SDK. Xcode build/launch
and PostgreSQL-backed checks require their respective dependencies:

```bash
./scripts/preflight.sh
xcrun swiftc -parse ios/ListingEvalApp/*.swift
xcrun swiftc -typecheck ios/ListingEvalApp/*.swift
plutil -lint ios/ListingEvalApp/Info.plist
```

Full completion requires a real Xcode build/launch and at least one
Postgres-backed game-service smoke, either through `MEDIEVAL_RUN_POSTGRES_SMOKE`,
Docker Compose, GitHub Actions, or Coolify.
