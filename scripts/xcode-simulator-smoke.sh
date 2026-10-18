#!/usr/bin/env bash

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -n "${MEDIEVAL_XCODE_PROJECT:-}" ]]; then
  PROJECT="$MEDIEVAL_XCODE_PROJECT"
elif [[ -d "$APP_DIR/ios/ListingEvalApp.xcodeproj" ]]; then
  PROJECT="ios/ListingEvalApp.xcodeproj"
else
  PROJECT="ListingEvalApp.xcodeproj"
fi
SCHEME="${MEDIEVAL_XCODE_SCHEME:-ListingEvalApp}"
BUNDLE_ID="${MEDIEVAL_APP_BUNDLE_ID:-com.auctionscrapers.listingeval}"
DERIVED_DATA="${MEDIEVAL_DERIVED_DATA:-$APP_DIR/DerivedData/MediEvalSimulatorSmoke}"
APP_PRODUCT="${MEDIEVAL_APP_PRODUCT:-ListingEvalApp.app}"
USE_LOCAL_DEMO="${MEDIEVAL_SIMULATOR_USE_LOCAL_DEMO:-0}"
DEMO_HOST="${MEDIEVAL_DEMO_HOST:-127.0.0.1}"
DEMO_PORT="${MEDIEVAL_DEMO_PORT:-5199}"
DEMO_TOKEN="${MEDIEVAL_DEMO_TOKEN:-demo-token}"
DEMO_LOG="${MEDIEVAL_DEMO_LOG:-${TMPDIR:-/tmp}/medieval-simulator-demo.log}"
SCREENSHOT_DELAY="${MEDIEVAL_SIMULATOR_SCREENSHOT_DELAY:-2}"
DEMO_PID=""

cleanup() {
  if [[ -n "$DEMO_PID" ]]; then
    kill "$DEMO_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

is_truthy() {
  case "$1" in
    1|true|TRUE|True|yes|YES|Yes|y|Y|on|ON|On) return 0 ;;
    *) return 1 ;;
  esac
}

start_demo_backend() {
  require_command node
  require_command curl

  if [[ ! -f "$APP_DIR/scripts/demo-server.mjs" ]]; then
    printf 'Local Demo requested, but scripts/demo-server.mjs was not found.\n' >&2
    exit 1
  fi

  HOST="$DEMO_HOST" MEDIEVAL_DEMO_PORT="$DEMO_PORT" MEDIEVAL_DEMO_TOKEN="$DEMO_TOKEN" \
    node "$APP_DIR/scripts/demo-server.mjs" > "$DEMO_LOG" 2>&1 &
  DEMO_PID="$!"

  local ready=0
  local url="http://$DEMO_HOST:$DEMO_PORT/ready"
  for _ in {1..50}; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 0.2
  done

  if [[ "$ready" != "1" ]]; then
    printf 'Local Demo backend did not become ready at %s.\n' "$url" >&2
    printf 'Demo log: %s\n' "$DEMO_LOG" >&2
    tail -80 "$DEMO_LOG" >&2 || true
    exit 1
  fi

  printf 'Local Demo backend ready at http://%s:%s.\n' "$DEMO_HOST" "$DEMO_PORT"
}

find_simulator() {
  local requested_name="$1"
  local requested_state="${2:-}"
  local in_ios=0
  local line

  while IFS= read -r line; do
    if [[ "$line" == "-- iOS"* ]]; then
      in_ios=1
      continue
    fi
    if [[ "$line" == "--"* ]]; then
      in_ios=0
      continue
    fi
    if [[ "$in_ios" -ne 1 ]]; then
      continue
    fi
    if [[ -n "$requested_name" && "$line" != *"$requested_name"* ]]; then
      continue
    fi
    if [[ -n "$requested_state" && "$line" != *"($requested_state)"* ]]; then
      continue
    fi
    if [[ "$line" =~ \(([0-9A-Fa-f-]{36})\) ]]; then
      printf '%s\n' "${BASH_REMATCH[1]}"
      return 0
    fi
  done < <(xcrun simctl list devices available)

  return 1
}

pick_simulator() {
  if [[ -n "${MEDIEVAL_SIMULATOR_ID:-}" ]]; then
    printf '%s\n' "$MEDIEVAL_SIMULATOR_ID"
    return 0
  fi

  local requested_name="${MEDIEVAL_SIMULATOR_NAME:-}"
  find_simulator "$requested_name" "Booted" \
    || find_simulator "$requested_name" "Shutdown" \
    || find_simulator "$requested_name" ""
}

require_command xcodebuild
require_command xcrun

if [[ -z "$DERIVED_DATA" || "$DERIVED_DATA" == "/" ]]; then
  printf 'Refusing unsafe MEDIEVAL_DERIVED_DATA value: %s\n' "${DERIVED_DATA:-<empty>}" >&2
  exit 1
fi

if ! xcrun --sdk iphonesimulator --show-sdk-path >/dev/null 2>&1; then
  printf 'Full Xcode with the iOS Simulator SDK is required. Current developer directory:\n' >&2
  xcode-select -p >&2 || true
  exit 1
fi

SIMULATOR_ID="$(pick_simulator || true)"
if [[ -z "$SIMULATOR_ID" ]]; then
  printf 'No available iOS Simulator matched MEDIEVAL_SIMULATOR_NAME=%s.\n' "${MEDIEVAL_SIMULATOR_NAME:-<any>}" >&2
  printf 'Available devices:\n' >&2
  xcrun simctl list devices available >&2
  exit 1
fi

printf 'Using simulator: %s\n' "$SIMULATOR_ID"
open -a Simulator >/dev/null 2>&1 || true
xcrun simctl boot "$SIMULATOR_ID" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$SIMULATOR_ID" -b

rm -rf "$DERIVED_DATA"

xcodebuild \
  -project "$APP_DIR/$PROJECT" \
  -scheme "$SCHEME" \
  -destination "id=$SIMULATOR_ID" \
  -derivedDataPath "$DERIVED_DATA" \
  build \
  CODE_SIGNING_ALLOWED=NO

APP_PATH="$DERIVED_DATA/Build/Products/Debug-iphonesimulator/$APP_PRODUCT"
if [[ ! -d "$APP_PATH" ]]; then
  printf 'Built app was not found at %s\n' "$APP_PATH" >&2
  exit 1
fi

xcrun simctl install "$SIMULATOR_ID" "$APP_PATH"

launch_args=()
if is_truthy "$USE_LOCAL_DEMO"; then
  start_demo_backend
  export SIMCTL_CHILD_MEDIEVAL_USE_LOCAL_DEMO=1
  launch_args+=(--medieval-use-local-demo)
fi

xcrun simctl terminate "$SIMULATOR_ID" "$BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl launch "$SIMULATOR_ID" "$BUNDLE_ID" "${launch_args[@]}"

if [[ -n "${MEDIEVAL_SIMULATOR_SCREENSHOT:-}" ]]; then
  sleep "$SCREENSHOT_DELAY"
  xcrun simctl io "$SIMULATOR_ID" screenshot "$MEDIEVAL_SIMULATOR_SCREENSHOT"
  printf 'Screenshot: %s\n' "$MEDIEVAL_SIMULATOR_SCREENSHOT"
fi

printf 'MediEval launched on simulator %s with bundle id %s.\n' "$SIMULATOR_ID" "$BUNDLE_ID"
if is_truthy "$USE_LOCAL_DEMO"; then
  printf 'Launch used the bundled Local Demo backend and seeded demo settings.\n'
fi
