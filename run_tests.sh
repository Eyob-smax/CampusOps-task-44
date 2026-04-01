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

# Unit tests (Vitest — runs inside backend container)
run_suite "Unit Tests (Vitest)" \
  "$COMPOSE_TEST run --rm --build --no-deps backend-unit-test-runner"

# API functional tests (Supertest/Jest — requires db + redis + backend)
run_suite "API Functional Tests (Supertest)" \
  "$COMPOSE_TEST run --rm --build api-test-runner"

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
