# MediEval

Standalone SwiftUI iOS app for reviewing MediEval human-eval cards.

For the shortest move-to-another-machine checklist, start with `../docs/HANDOFF.md`.
Commands below that use `npm` or `scripts/` should be run from the repo root.

MediEval keeps the existing binary human-eval workflow and wraps it in a light
8-bit medieval RPG theme:

- eval cards are quests
- `yes` / `no` / `unsure` are shown as Aye / Nay / Hmm
- low-confidence cards are framed as higher-risk quests
- cards can be swiped right for Aye or left for Nay from the claim area
- wrong answers open the Scribe the Truth correction flow
- the Guild Hall shows progress, quest counts, XP, gold, daily quests, and the shared Round Table leaderboard when the game service is configured

The theme is presentation-only. API payloads still use the server's canonical
answer values: `yes`, `no`, `unsure`, `bad_question`, and `skip`.

MediEval can also report verdicts to the separate Postgres-backed game service
in `../game-service`. That service owns durable XP, gold, streaks,
leaderboards, and daily quests. The game service is optional; if its URL/token
are blank, the app still submits eval results to the eval backend and keeps local
progress on-device.

The game service API contract and Coolify checklist live in:

- `../game-service/docs/API.md`
- `../game-service/docs/COOLIFY.md`

When the game service is configured, the app is local-first:

- verdicts update local XP/gold immediately
- shared guild rewards are sent only after the eval verdict is accepted by the eval backend
- accepted eval cards are remembered per eval backend and reviewer so backend repeats stay hidden locally
- accepted guild reward events are sealed locally if the game service is not configured yet
- transient eval submission failures are queued on-device
- hard eval-backend rejections stay on the current card with a visible error
- failed game-service submissions are queued on-device
- hard game-service failures stay sealed and show a Guild Hall settings hint
- the game queue retries on refresh
- queued eval and game events can be retried manually from the Guild Hall
- on-device queues are de-duped before retrying
- the Guild Hall replaces local progress with the Postgres-backed profile after sync
- the Round Table leaderboard updates after profile sync and successful verdict rewards

## Run

1. Start an eval backend with `EVAL_MOBILE_TOKEN` set.
2. Open `ListingEvalApp.xcodeproj` in Xcode.
3. Run the `ListingEvalApp` target on a simulator or device.
4. Enter the eval backend base URL, guild/reviewer name, and token in the app setup screen.
5. Optionally enter a run ID to review a specific run when the backend supports it.
6. Optionally enter the MediEval game service URL and token to sync rewards to Postgres.
7. Use the setup screen's connection checks to verify the eval backend and guild backend before reviewing.

URL fields are normalized to the service root. If you paste an admin page,
Coolify page, or API endpoint URL, MediEval drops the path/query before calling
its own API routes.

Before opening Xcode, you can run the local preflight from the repo root:

```bash
./scripts/preflight.sh
```

The preflight validates the app files, URL setup, reward scoring, payload
contracts, outbox durability, and the deck paging/no-repeat guard. It also runs
the game service's own preflight when present. External adapter, live eval
backend, live game service, Docker/Postgres, and full simulator build/launch
checks are opt-in with environment variables; see `../docs/VERIFY.md`.

For a fast no-Xcode packaging check, run:

```bash
npm run verify:xcode
```

That verifies the shared scheme, source build phase, app plist, and app icon
catalog before you hand the folder to another Mac or GitHub Actions.

On a Mac with full Xcode installed, this builds, installs, and launches the app
in an available iOS Simulator:

```bash
npm run simulator:smoke
```

Set `MEDIEVAL_SIMULATOR_NAME` when you want a specific device, or set
`MEDIEVAL_SIMULATOR_SCREENSHOT=/tmp/medieval.png` to save a launch screenshot.
To prove the first-screen demo flow instead of only process launch, run:

```bash
MEDIEVAL_SIMULATOR_SCREENSHOT=/tmp/medieval-demo.png npm run simulator:demo-smoke
```

That starts the bundled Local Demo backend, seeds the Simulator launch with demo
settings, opens MediEval into real eval cards, and saves a screenshot if
`MEDIEVAL_SIMULATOR_SCREENSHOT` is set.

## Local Demo Backend

For a fast end-to-end app smoke test without an external eval backend or Coolify,
start the bundled demo backend:

```bash
npm run demo
```

Then use these settings in the iOS app:

- Dashboard URL: `http://127.0.0.1:5199`
- Royal seal: `demo-token`
- Guild backend URL: `http://127.0.0.1:5199`
- Guild backend token: `demo-token`

You can also tap `Use Local Demo` on the app setup screen to fill those values
in the iOS Simulator.

For a physical iPhone on the same Wi-Fi network, run:

```bash
npm run demo:lan
```

The demo server prints usable URLs. Pick the Wi-Fi URL, for example
`http://192.168.1.42:5199`, and use it for both Dashboard URL and Guild backend
URL. iOS will ask for Local Network access the first time; allow it so MediEval
can reach the demo server. On a physical iPhone, `Use Local Demo` fills the demo
tokens and reviewer, but it leaves loopback URLs blank so you can paste the
Wi-Fi URL. Deployed eval and guild URLs should use HTTPS.

The demo backend serves synthetic eval cards, generated PNG images, accepts
corrections, awards demo XP/gold, and returns a leaderboard. It is in-memory and
resets when stopped.

To smoke test the demo backend from the terminal:

```bash
npm run demo:smoke
```

That command starts a temporary local demo server when `MEDIEVAL_DEMO_BASE_URL`
is not set, then proves deck fetch, image fetch, result write, duplicate
protection, no-repeat pending cards, reward scoring, and leaderboard responses.

To test a server you already started, pass its URL:

```bash
MEDIEVAL_DEMO_BASE_URL=http://127.0.0.1:5199 npm run demo:smoke
```

## Local Integration Smoke

When you have an external eval adapter repo and the `game-service` folder is
present, run:

```bash
MEDIEVAL_EVAL_ADAPTER_DIR=/path/to/eval-adapter npm run local:integration
```

That starts a temporary external adapter, a temporary in-memory game service,
writes one eval result, sends the paired guild reward, checks duplicate
protection on both services, and confirms the reviewed card does not reappear in
the adapter's unreviewed deck.

## Live Service Smoke

After the eval backend and Coolify game service are deployed, run a combined
read-only smoke from this folder:

```bash
MEDIEVAL_DASHBOARD_BASE_URL=https://your-eval-backend.example.com \
EVAL_MOBILE_TOKEN=<shared-eval-token> \
MEDIEVAL_GAME_BASE_URL=https://your-game-service.example.com \
MEDIEVAL_GAME_TOKEN=<shared-game-token> \
npm run live:smoke
```

To prove the full deployed loop, add `MEDIEVAL_LIVE_WRITE_SMOKE=1`. That writes
one eval result, sends the paired guild reward, checks duplicate protection, and
confirms the reviewed card does not reappear in the unreviewed deck.

`MEDIEVAL_DASHBOARD_BASE_URL` is the legacy environment variable name for the
eval backend URL.

## GitHub Build Bridge

This repo is self-contained enough to push as its own repository. The included
GitHub Actions workflow at `.github/workflows/ci.yml` runs on a macOS runner and
performs a real iOS Simulator build/install/launch smoke against the bundled
Local Demo backend. The Xcode scheme is shared at
`ios/ListingEvalApp.xcodeproj/xcshareddata/xcschemes/ListingEvalApp.xcscheme`, so
GitHub and a fresh Mac can build the same target:

```bash
git remote set-url origin git@github.com:<you>/<repo>.git
git push -u origin main
```

After the push, open the repository's Actions tab and run or inspect the
`MediEval iOS` workflow. A green workflow is the best remote proof that the
project builds, launches, and can open demo eval cards before you open it
locally in Xcode. The workflow uploads both a simulator screenshot and the clean
handoff zip from `dist/`, so GitHub can act as the bridge to another Mac.

## Release Bundles

To create clean handoff zips from the repo root:

```bash
npm run bundle
npm run bundle:verify
npm run bundle:smoke
```

The command writes timestamped archives to `dist/`:

- `MediEval-iOS-*.zip`
- `MediEvalGameService-*.zip`, when the `game-service` folder exists

All bundles exclude local git state, build products, `node_modules`, `.env`, and
runtime data. The iOS bundle also excludes Xcode user state. `bundle:smoke`
extracts the newest archives into a temporary folder and runs the handoff checks
from inside the extracted copies. To include these checks in the full preflight,
run:

```bash
MEDIEVAL_RUN_BUNDLE_VERIFY=1 ./scripts/preflight.sh
```

The app calls:

- `GET /api/mobile/eval/cards`
- `POST /api/mobile/eval/results`
- `GET /api/mobile/eval/summary`

Eval result submissions include an optional `eventId`. The eval backend treats it
as an idempotency key, so a retry after a network timeout returns the previously
stored result instead of writing a duplicate JSONL row. Older queued payloads
without `eventId` still work; the eval backend derives a retry key from reviewer,
card ID, and client timestamp.

Transient eval result submission failures are saved locally and retried on the
next refresh. Hard eval-backend rejections, such as a bad token or invalid card,
stay on the current card with an error instead of silently moving on. Failed
game-service reward events are also saved locally and retried on refresh. Hard
game-service failures keep the reward sealed and point you back to Settings.

URL fields accept full `http://` or `https://` URLs. If you omit the scheme,
MediEval treats localhost and private LAN addresses as `http://`, and deployed
hostnames as `https://`.

See `../docs/VERIFY.md` for the full eval backend, game service, Xcode, and
in-app smoke test checklist.
