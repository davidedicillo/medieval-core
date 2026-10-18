#!/usr/bin/env bash

set -u

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVAL_ADAPTER_DIR="${MEDIEVAL_EVAL_ADAPTER_DIR:-${MEDIEVAL_DASHBOARD_DIR:-}}"
GAME_DIR="${MEDIEVAL_GAME_SERVICE_DIR:-$APP_DIR/game-service}"
if [ -d "$APP_DIR/ios/ListingEvalApp" ]; then
  IOS_SOURCE_DIR="ios/ListingEvalApp"
  IOS_PROJECT="ios/ListingEvalApp.xcodeproj"
else
  IOS_SOURCE_DIR="ListingEvalApp"
  IOS_PROJECT="ListingEvalApp.xcodeproj"
fi

passes=0
failures=0
skips=0

note() {
  printf '\n%s\n' "$1"
}

pass() {
  passes=$((passes + 1))
  printf 'PASS: %s\n' "$1"
}

fail() {
  failures=$((failures + 1))
  printf 'FAIL: %s\n' "$1"
}

skip() {
  skips=$((skips + 1))
  printf 'SKIP: %s\n' "$1"
}

run_in_dir() {
  local title="$1"
  local dir="$2"
  local command="$3"

  note "==> $title"
  if [ ! -d "$dir" ]; then
    skip "$title ($dir not found)"
    return
  fi

  if (cd "$dir" && bash -lc "$command"); then
    pass "$title"
  else
    fail "$title"
  fi
}

install_node_dependencies() {
  local title="$1"
  local dir="$2"

  note "==> $title"
  if [ ! -d "$dir" ]; then
    skip "$title ($dir not found)"
    return
  fi
  if [ ! -f "$dir/package.json" ]; then
    skip "$title (package.json not found)"
    return
  fi
  if ! have_command npm; then
    skip "$title (npm not found)"
    return
  fi
  if [ -d "$dir/node_modules" ]; then
    pass "$title"
    return
  fi

  if [ -f "$dir/package-lock.json" ]; then
    if (cd "$dir" && npm ci --ignore-scripts --no-audit --fund=false); then
      pass "$title"
    else
      fail "$title"
    fi
  else
    if (cd "$dir" && npm install --ignore-scripts --no-audit --fund=false); then
      pass "$title"
    else
      fail "$title"
    fi
  fi
}

have_command() {
  command -v "$1" >/dev/null 2>&1
}

note "MediEval preflight"
printf 'App: %s\n' "$APP_DIR"
if [ -n "$EVAL_ADAPTER_DIR" ]; then
  printf 'External eval adapter: %s\n' "$EVAL_ADAPTER_DIR"
else
  printf 'External eval adapter: %s\n' "not configured"
fi
printf 'Game service: %s\n' "$GAME_DIR"

if have_command xcrun; then
  run_in_dir "Swift syntax parser" "$APP_DIR" "xcrun swiftc -parse $IOS_SOURCE_DIR/*.swift"
  run_in_dir "Swift type check" "$APP_DIR" "xcrun swiftc -typecheck $IOS_SOURCE_DIR/*.swift"
  run_in_dir "URL normalization smoke" "$APP_DIR" "tmp=\"\${TMPDIR:-/tmp}/medieval-url-smoke-\$\$\"; xcrun swiftc $IOS_SOURCE_DIR/Models.swift $IOS_SOURCE_DIR/APIClient.swift scripts/url-normalization-smoke.swift -o \"\$tmp\" && \"\$tmp\"; rc=\$?; rm -f \"\$tmp\"; exit \$rc"
  run_in_dir "settings validation smoke" "$APP_DIR" "tmp=\"\${TMPDIR:-/tmp}/medieval-settings-smoke-\$\$\"; xcrun swiftc $IOS_SOURCE_DIR/Models.swift $IOS_SOURCE_DIR/APIClient.swift $IOS_SOURCE_DIR/OutboxStore.swift $IOS_SOURCE_DIR/PlatformAccount.swift $IOS_SOURCE_DIR/ContentView.swift scripts/settings-validation-smoke.swift -o \"\$tmp\" && \"\$tmp\"; rc=\$?; rm -f \"\$tmp\"; exit \$rc"
  run_in_dir "payload contract smoke" "$APP_DIR" "tmp=\"\${TMPDIR:-/tmp}/medieval-payload-smoke-\$\$\"; xcrun swiftc $IOS_SOURCE_DIR/Models.swift $IOS_SOURCE_DIR/APIClient.swift scripts/payload-contract-smoke.swift -o \"\$tmp\" && \"\$tmp\"; rc=\$?; rm -f \"\$tmp\"; exit \$rc"
  run_in_dir "deck paging smoke" "$APP_DIR" "tmp=\"\${TMPDIR:-/tmp}/medieval-deck-paging-smoke-\$\$\"; xcrun swiftc $IOS_SOURCE_DIR/Models.swift scripts/deck-paging-smoke.swift -o \"\$tmp\" && \"\$tmp\"; rc=\$?; rm -f \"\$tmp\"; exit \$rc"
  run_in_dir "reward scoring smoke" "$APP_DIR" "tmp=\"\${TMPDIR:-/tmp}/medieval-reward-smoke-\$\$\"; xcrun swiftc $IOS_SOURCE_DIR/Models.swift scripts/reward-scoring-smoke.swift -o \"\$tmp\" && \"\$tmp\"; rc=\$?; rm -f \"\$tmp\"; exit \$rc"
  run_in_dir "outbox storage smoke" "$APP_DIR" "tmp=\"\${TMPDIR:-/tmp}/medieval-outbox-smoke-\$\$\"; xcrun swiftc $IOS_SOURCE_DIR/Models.swift $IOS_SOURCE_DIR/APIClient.swift $IOS_SOURCE_DIR/OutboxStore.swift scripts/outbox-storage-smoke.swift -o \"\$tmp\" && \"\$tmp\"; rc=\$?; rm -f \"\$tmp\"; exit \$rc"
else
  skip "Swift syntax parser (xcrun not found)"
  skip "Swift type check (xcrun not found)"
  skip "URL normalization smoke (xcrun not found)"
  skip "settings validation smoke (xcrun not found)"
  skip "payload contract smoke (xcrun not found)"
  skip "deck paging smoke (xcrun not found)"
  skip "reward scoring smoke (xcrun not found)"
  skip "outbox storage smoke (xcrun not found)"
fi

if have_command plutil; then
  run_in_dir "Info.plist validation" "$APP_DIR" "plutil -lint $IOS_SOURCE_DIR/Info.plist"
  run_in_dir "local network plist validation" "$APP_DIR" "plutil -p $IOS_SOURCE_DIR/Info.plist | grep -q 'NSLocalNetworkUsageDescription' && plutil -p $IOS_SOURCE_DIR/Info.plist | grep -q 'NSAllowsLocalNetworking'"
else
  skip "Info.plist validation (plutil not found)"
  skip "local network plist validation (plutil not found)"
fi

if have_command ruby; then
  run_in_dir "shared Xcode scheme validation" "$APP_DIR" "ruby -rrexml/document -e 'REXML::Document.new(File.read(\"$IOS_PROJECT/xcshareddata/xcschemes/ListingEvalApp.xcscheme\")); puts \"scheme XML ok\"'"
else
  skip "shared Xcode scheme validation (ruby not found)"
fi

if have_command node; then
  run_in_dir "Xcode project package validation" "$APP_DIR" "npm run verify:xcode"
  run_in_dir "asset catalog JSON validation" "$APP_DIR" "node -e 'const fs=require(\"fs\"); for (const p of [\"$IOS_SOURCE_DIR/Assets.xcassets/Contents.json\",\"$IOS_SOURCE_DIR/Assets.xcassets/AccentColor.colorset/Contents.json\",\"$IOS_SOURCE_DIR/Assets.xcassets/AppIcon.appiconset/Contents.json\"]) JSON.parse(fs.readFileSync(p,\"utf8\"));'"
  run_in_dir "demo and bundle script validation" "$APP_DIR" "node --check scripts/demo-server.mjs && node --check scripts/demo-smoke.mjs && node --check scripts/live-integration-smoke.mjs && node --check scripts/local-integration-smoke.mjs && node --check scripts/create-release-bundle.mjs && node --check scripts/verify-release-bundle.mjs && node --check scripts/smoke-release-bundle.mjs && node --check scripts/verify-xcode-project.mjs && bash -n scripts/xcode-simulator-smoke.sh && test -f scripts/url-normalization-smoke.swift && grep -q '@main' scripts/url-normalization-smoke.swift && test -f scripts/settings-validation-smoke.swift && grep -q '@main' scripts/settings-validation-smoke.swift && test -f scripts/payload-contract-smoke.swift && grep -q '@main' scripts/payload-contract-smoke.swift && test -f scripts/deck-paging-smoke.swift && grep -q '@main' scripts/deck-paging-smoke.swift && test -f scripts/reward-scoring-smoke.swift && grep -q '@main' scripts/reward-scoring-smoke.swift && test -f scripts/outbox-storage-smoke.swift && grep -q '@main' scripts/outbox-storage-smoke.swift && node -e 'const pkg=JSON.parse(require(\"fs\").readFileSync(\"package.json\",\"utf8\")); for (const name of [\"eval-api\",\"eval-api:smoke\",\"oss:check\",\"demo\",\"demo:lan\",\"demo:smoke\",\"live:smoke\",\"local:integration\",\"bundle\",\"bundle:verify\",\"bundle:smoke\",\"verify:xcode\",\"simulator:smoke\",\"simulator:demo-smoke\",\"preflight\"]) if (!pkg.scripts?.[name]) throw new Error(\"Missing npm script: \" + name);'"
  run_in_dir "open-source eval API syntax" "$APP_DIR" "node --check packages/schema/index.mjs && node --check packages/schema/card-generator.mjs && node --check packages/cli/medieval-eval.mjs && node --check services/eval-api/store.mjs && node --check services/eval-api/dashboard.mjs && node --check services/eval-api/server.mjs && node --check scripts/eval-api-smoke.mjs"
  run_in_dir "open-source eval API smoke" "$APP_DIR" "npm run eval-api:smoke"
else
  skip "Xcode project package validation (node not found)"
  skip "asset catalog JSON validation (node not found)"
  skip "demo and bundle script validation (node not found)"
  skip "open-source eval API syntax (node not found)"
  skip "open-source eval API smoke (node not found)"
fi

if [ "${MEDIEVAL_RUN_BUNDLE_VERIFY:-0}" = "1" ]; then
  if have_command npm && have_command zip && have_command zipinfo; then
    run_in_dir "release bundle verification" "$APP_DIR" "npm run bundle && npm run bundle:verify && npm run bundle:smoke"
  else
    skip "release bundle verification (npm, zip, or zipinfo not found)"
  fi
else
  skip "release bundle verification (set MEDIEVAL_RUN_BUNDLE_VERIFY=1 to run it)"
fi

if have_command node && have_command curl; then
  run_in_dir "local demo backend smoke" "$APP_DIR" "log=\"\${TMPDIR:-/tmp}/medieval-demo-preflight.log\"; MEDIEVAL_DEMO_PORT=5198 node scripts/demo-server.mjs > \"\$log\" 2>&1 & pid=\$!; trap 'kill \"\$pid\" >/dev/null 2>&1 || true' EXIT; ready=0; for attempt in \$(seq 1 30); do if curl -fsS http://127.0.0.1:5198/ready >/dev/null 2>&1; then ready=1; break; fi; sleep 0.2; done; test \"\$ready\" = 1 || { cat \"\$log\"; exit 1; }; MEDIEVAL_DEMO_BASE_URL=http://127.0.0.1:5198 node scripts/demo-smoke.mjs"
else
  skip "local demo backend smoke (node or curl not found)"
fi

if [ -n "$EVAL_ADAPTER_DIR" ] && [ -f "$EVAL_ADAPTER_DIR/package.json" ]; then
  install_node_dependencies "external eval adapter dependencies" "$EVAL_ADAPTER_DIR"
fi

if [ -f "$GAME_DIR/package.json" ]; then
  install_node_dependencies "game service dependencies" "$GAME_DIR"
fi

note "==> Xcode project visibility"
if have_command xcodebuild && have_command xcrun && xcrun --sdk iphonesimulator --show-sdk-path >/dev/null 2>&1; then
  if (cd "$APP_DIR" && xcodebuild -list -project "$IOS_PROJECT"); then
    pass "Xcode project visibility"
  else
    fail "Xcode project visibility"
  fi
else
  skip "Xcode project visibility (full Xcode iOS simulator SDK not available)"
fi

if [ "${MEDIEVAL_RUN_XCODE_BUILD:-0}" = "1" ]; then
  destination="${MEDIEVAL_XCODE_DESTINATION:-generic/platform=iOS Simulator}"
  run_in_dir "Xcode simulator build" "$APP_DIR" "xcodebuild -project '$IOS_PROJECT' -scheme ListingEvalApp -destination '$destination' build CODE_SIGNING_ALLOWED=NO"
else
  skip "Xcode simulator build (set MEDIEVAL_RUN_XCODE_BUILD=1 to run it)"
fi

if [ "${MEDIEVAL_RUN_XCODE_LAUNCH:-0}" = "1" ]; then
  run_in_dir "Xcode simulator launch smoke" "$APP_DIR" "scripts/xcode-simulator-smoke.sh"
else
  skip "Xcode simulator launch smoke (set MEDIEVAL_RUN_XCODE_LAUNCH=1 to run it on a Mac with full Xcode)"
fi

if [ -n "$EVAL_ADAPTER_DIR" ] && [ -f "$EVAL_ADAPTER_DIR/scripts/daily-sales-pipeline-dashboard.mjs" ] && [ -f "$EVAL_ADAPTER_DIR/test/daily-sales-pipeline-dashboard.test.mjs" ]; then
  if have_command node; then
    run_in_dir "external eval adapter syntax" "$EVAL_ADAPTER_DIR" "node --check scripts/daily-sales-pipeline-dashboard.mjs && node --check scripts/medieval-dashboard-smoke.mjs"
    run_in_dir "external eval adapter tests" "$EVAL_ADAPTER_DIR" "node --test test/daily-sales-pipeline-dashboard.test.mjs"
  else
    skip "external eval adapter checks (node not found)"
  fi
else
  skip "external eval adapter checks (set MEDIEVAL_EVAL_ADAPTER_DIR to an adapter repo)"
fi

if [ -n "$EVAL_ADAPTER_DIR" ] && [ -f "$EVAL_ADAPTER_DIR/scripts/medieval-dashboard-smoke.mjs" ] && have_command npm; then
  if [ -n "${MEDIEVAL_DASHBOARD_BASE_URL:-}" ] && { [ -n "${EVAL_MOBILE_TOKEN:-}" ] || [ -n "${MEDIEVAL_DASHBOARD_TOKEN:-}" ]; }; then
    run_in_dir "live eval adapter mobile API smoke" "$EVAL_ADAPTER_DIR" "npm run medieval:dashboard:smoke"
  else
    run_in_dir "local eval adapter mobile API smoke" "$EVAL_ADAPTER_DIR" "MEDIEVAL_DASHBOARD_BASE_URL= EVAL_MOBILE_BASE_URL= DASHBOARD_BASE_URL= EVAL_MOBILE_TOKEN= MEDIEVAL_DASHBOARD_TOKEN= npm run medieval:dashboard:smoke"
  fi
else
  skip "external eval adapter mobile API smoke (adapter script or npm not available)"
fi

if [ -n "$EVAL_ADAPTER_DIR" ] && [ -f "$EVAL_ADAPTER_DIR/scripts/daily-sales-pipeline-dashboard.mjs" ] && [ -f "$GAME_DIR/src/app.js" ] && have_command npm; then
  run_in_dir "local eval adapter and guild integration smoke" "$APP_DIR" "MEDIEVAL_EVAL_ADAPTER_DIR='$EVAL_ADAPTER_DIR' MEDIEVAL_DASHBOARD_BASE_URL= EVAL_MOBILE_BASE_URL= DASHBOARD_BASE_URL= MEDIEVAL_GAME_BASE_URL= MEDIEVAL_LIVE_WRITE_SMOKE=1 MEDIEVAL_REQUIRE_PENDING_CARDS=1 npm run local:integration"
else
  skip "local eval adapter and guild integration smoke (set MEDIEVAL_EVAL_ADAPTER_DIR to an adapter repo)"
fi

if [ "${MEDIEVAL_RUN_LIVE_SMOKE:-0}" = "1" ]; then
  if [ -n "${MEDIEVAL_DASHBOARD_BASE_URL:-}" ] && { [ -n "${EVAL_MOBILE_TOKEN:-}" ] || [ -n "${MEDIEVAL_DASHBOARD_TOKEN:-}" ]; } && [ -n "${MEDIEVAL_GAME_BASE_URL:-}" ] && [ -n "${MEDIEVAL_GAME_TOKEN:-}" ]; then
    run_in_dir "live eval backend and guild integration smoke" "$APP_DIR" "npm run live:smoke"
  else
    fail "live eval backend and guild integration smoke"
  fi
else
  skip "live eval backend and guild integration smoke (set MEDIEVAL_RUN_LIVE_SMOKE=1 with eval backend and game service env vars)"
fi

if [ -f "$GAME_DIR/package.json" ]; then
  if have_command npm; then
    run_in_dir "game service preflight" "$GAME_DIR" "npm run preflight"
  else
    skip "game service checks (npm not found)"
  fi
else
  skip "game service checks (service folder not found at $GAME_DIR)"
fi

note "Preflight summary"
printf 'PASS: %s\n' "$passes"
printf 'FAIL: %s\n' "$failures"
printf 'SKIP: %s\n' "$skips"

if [ "$failures" -gt 0 ]; then
  exit 1
fi
