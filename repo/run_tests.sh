#!/usr/bin/env bash
# ============================================================
# run_tests.sh — CampusOps Test Runner
# Runs frontend unit tests, backend unit tests, and API tests
# inside Docker containers and prints a pass/fail summary.
# ============================================================
set -euo pipefail

PASS=0
FAIL=0
SUMMARY=()

print_header() {
  echo ""
  echo "========================================"
  echo "  $1"
  echo "========================================"
}

COMPOSE_TEST="docker compose -f docker-compose.yml -f docker-compose.test.yml"
PROJECT_NAME="campusops-test"
# Use a per-run volume namespace to avoid lock collisions with leftovers
# from other compose projects that may have reused static volume names.
export TEST_PROJECT_NAME="${PROJECT_NAME}-${RANDOM}"
COMPOSE_TEST="docker compose -p ${PROJECT_NAME} -f docker-compose.yml -f docker-compose.test.yml"

cleanup() {
  ${COMPOSE_TEST} down -v --remove-orphans >/dev/null 2>&1 || true
}

trap cleanup EXIT

bootstrap_runtime_secrets() {
  local template_dir="secrets"
  local runtime_dir="runtime-secrets"

  mkdir -p "$runtime_dir"

  for name in db_password db_root_password jwt_secret encryption_key; do
    local src="$template_dir/${name}.txt.example"
    local dst="$runtime_dir/${name}.txt"

    # Repair accidental directory paths (can happen after failed secret mounts).
    if [[ -d "$dst" ]]; then
      rm -rf "$dst"
      echo "[run_tests] Repaired malformed secret path directory: $dst"
    fi

    if [[ -f "$src" && ! -f "$dst" ]]; then
      cp "$src" "$dst"
      echo "[run_tests] Created missing $dst from template"
    fi
  done
}

bootstrap_runtime_secrets

# Start from a clean isolated test stack every run.
cleanup

run_suite() {
  local name="$1"
  local command="$2"
  print_header "$name"
  if eval "$command"; then
    PASS=$((PASS + 1))
    SUMMARY+=("  [PASS] $name")
  else
    FAIL=$((FAIL + 1))
    SUMMARY+=("  [FAIL] $name")
  fi
}

# Frontend unit tests (Vitest)
run_suite "Frontend Unit Tests (Vitest)" \
  "$COMPOSE_TEST run --rm --build --no-deps frontend-test-runner"

# Backend/API test dependencies (db + redis)
run_suite "Prepare Backend/API Test Dependencies (db + redis)" \
  "$COMPOSE_TEST up -d --build --wait db redis"

# Unit tests (Vitest — runs inside backend container)
run_suite "Unit Tests (Vitest)" \
  "$COMPOSE_TEST run --rm --build --no-deps backend-unit-test-runner"

# API functional tests (Supertest/Jest)
run_suite "API Functional Tests (Supertest)" \
  "$COMPOSE_TEST run --rm --build --no-deps api-test-runner"

# Print summary
echo ""
echo "========================================"
echo "  TEST SUMMARY"
echo "========================================"
for line in "${SUMMARY[@]}"; do
  echo "$line"
done
echo ""
echo "  Suites passed: $PASS"
echo "  Suites failed: $FAIL"
echo "========================================"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
exit 0
