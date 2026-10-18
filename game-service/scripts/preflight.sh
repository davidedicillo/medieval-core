#!/usr/bin/env bash

set -u

SERVICE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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

have_command() {
  command -v "$1" >/dev/null 2>&1
}

run_check() {
  local title="$1"
  local command="$2"

  note "==> $title"
  if (cd "$SERVICE_DIR" && bash -lc "$command"); then
    pass "$title"
  else
    fail "$title"
  fi
}

note "MediEval game service preflight"
printf 'Service: %s\n' "$SERVICE_DIR"

if have_command npm; then
  run_check "Node syntax checks" "npm run lint"
else
  skip "Node syntax checks (npm not found)"
fi

if have_command npm; then
  run_check "API contract tests" "npm test"
else
  skip "API contract tests (npm not found)"
fi

if have_command npm; then
  run_check "local memory API smoke" "npm run smoke:memory"
else
  skip "local memory API smoke (npm not found)"
fi

if have_command npm; then
  run_check "deployment manifest validation" "npm run verify:deploy"
else
  skip "deployment manifest validation (npm not found)"
fi

if [ -n "${DATABASE_URL:-}" ]; then
  run_check "Postgres migrations" "npm run migrate"
else
  skip "Postgres migrations (set DATABASE_URL to test a real database)"
fi

if [ "${MEDIEVAL_RUN_POSTGRES_SMOKE:-0}" = "1" ]; then
  if [ -n "${DATABASE_URL:-}" ] || { [ -n "${POSTGRES_HOST:-}" ] && [ -n "${POSTGRES_DB:-}" ] && [ -n "${POSTGRES_USER:-}" ]; }; then
    run_check "Postgres-backed API smoke" "npm run smoke:postgres"
  else
    fail "Postgres-backed API smoke"
  fi
else
  skip "Postgres-backed API smoke (set MEDIEVAL_RUN_POSTGRES_SMOKE=1 with DATABASE_URL to run it)"
fi

if have_command docker; then
  note "==> Docker Compose config"
  if (cd "$SERVICE_DIR" && docker compose config -q); then
    pass "Docker Compose config"
  else
    fail "Docker Compose config"
  fi
else
  skip "Docker Compose config (docker not found)"
fi

if [ "${MEDIEVAL_RUN_DOCKER_SMOKE:-0}" = "1" ]; then
  if have_command docker; then
    run_check "Docker/Postgres smoke" "docker compose up --build -d && trap 'docker compose down' EXIT && ready=0; for attempt in \$(seq 1 60); do if curl -fsS http://127.0.0.1:8080/ready; then ready=1; break; fi; sleep 1; done; test \"\$ready\" = 1 && MEDIEVAL_GAME_BASE_URL=http://127.0.0.1:8080 MEDIEVAL_GAME_TOKEN=local-dev-token npm run smoke"
  else
    skip "Docker/Postgres smoke (docker not found)"
  fi
else
  skip "Docker/Postgres smoke (set MEDIEVAL_RUN_DOCKER_SMOKE=1 to run it)"
fi

if [ -n "${MEDIEVAL_GAME_BASE_URL:-}" ] && [ -n "${MEDIEVAL_GAME_TOKEN:-}" ]; then
  run_check "live game service smoke" "npm run smoke"
else
  skip "live game service smoke (set MEDIEVAL_GAME_BASE_URL and MEDIEVAL_GAME_TOKEN)"
fi

note "Preflight summary"
printf 'PASS: %s\n' "$passes"
printf 'FAIL: %s\n' "$failures"
printf 'SKIP: %s\n' "$skips"

if [ "$failures" -gt 0 ]; then
  exit 1
fi
