# Test Plan — CampusOps Fulfillment & Operations Platform

---

## 1. Test Strategy Overview

CampusOps uses three complementary test layers:

| Layer                | Framework        | Scope                             | Database                                                 |
| -------------------- | ---------------- | --------------------------------- | -------------------------------------------------------- |
| Frontend unit tests  | Vitest           | Frontend utility/composable logic | Not required                                             |
| Backend unit tests   | Vitest           | Service-layer business logic      | No real DB; in-memory fakes or mocked Prisma             |
| API functional tests | Jest + Supertest | Full HTTP request/response cycle  | Real MySQL (test Docker container, seeded with fixtures) |

**Key principles:**

- **No mocks of real services in API tests.** API tests run against a real MySQL instance started by `docker-compose.test.yml`. Redis is also real. This ensures that middleware chains, Prisma queries, BullMQ job creation, and serialization all work end-to-end.
- **Unit tests isolate business logic.** Service functions under test receive repository fakes, not real Prisma clients. This allows fast, deterministic tests for complex rules (compensation calculation, coupon stacking, fee computation, PII masking).
- **Frontend unit tests cover client-side network configuration logic.** `frontend/unit_tests/` validates direct backend/API URL resolution behavior.

---

## 2. Coverage Targets

| Metric     | Target |
| ---------- | ------ |
| Lines      | >= 90% |
| Functions  | >= 90% |
| Statements | >= 90% |
| Branches   | >= 85% |

Coverage is measured on the `backend/src/` source tree using Vitest's built-in coverage reporter (`@vitest/coverage-v8`).

---

## 3. Unit Test Inventory

All files are in `backend/unit_tests/`. Framework: Vitest.

| File                        | What it covers                                                                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.test.ts`              | Login validation, JWT generation and verification, refresh token lifecycle, password change logic, bcrypt comparison                                                    |
| `encryption.test.ts`        | AES-256-GCM encrypt/decrypt round-trips, key derivation, IV uniqueness, tamper detection                                                                                |
| `masking.test.ts`           | PII field masking for all five roles against all masked fields (name, ID, email, phone, balance); role escalation edge cases                                            |
| `master-data.test.ts`       | Department, semester, course, class, and student CRUD service logic; soft-delete behavior; unique-constraint error handling                                             |
| `permissions.test.ts`       | Permission matrix — each role's allowed and denied permission strings; `requirePermission` middleware logic; `denyAuditorWrites` guard                                  |
| `import-validation.test.ts` | CSV bulk import row validation (required fields, format checks, duplicate student numbers); error report generation                                                     |
| `classroom.test.ts`         | Heartbeat processing, online/offline/degraded status transitions, 90-second staleness detection, confidence threshold comparison                                        |
| `parking.test.ts`           | Entry/exit session logic, occupancy calculation, alert SLA deadline computation, 15-minute escalation detection, claim/close state transitions                          |
| `shipping.test.ts`          | Shipping fee calculation for weight-based templates, delivery zone lookup, fee edge cases (zero weight, fractional kg)                                                  |
| `coupon.test.ts`            | Coupon validation (expiry, min order, single-use flag, tier restriction), discount application, stacking prevention, growth points accrual                              |
| `shipment.test.ts`          | `simulateCarrierResponse` age-bucket logic, parcel status transitions, after-sales SLA helpers, and compensation approval/cap rules validated via production helpers      |
| `stored-value-policy.test.ts` | Stored-value feature-flag parsing, high-value top-up approval threshold evaluation, and role-based approval guards |
| `tenant-isolation.test.ts`  | Campus scoping helper assertions for student query filters and tenant boundary behavior |
| `schema-sync.test.ts`       | Ensures `database/schema.prisma` remains byte-equivalent to canonical `prisma/schema.prisma` across Docker and local test roots |
| `observability.test.ts`     | Metric snapshot collection, threshold evaluation (`>`, `<`, `>=`, `<=`, `==` with legacy alias support), alert creation on breach, backup manifest validation, log retention cutoff date calculation |
| `request-logger.test.ts`    | Structured HTTP request logging behavior and assertions that sensitive headers/body fields are not logged                                       |

Frontend unit tests are in `frontend/unit_tests/`.

| File              | What it covers                                                         |
| ----------------- | ---------------------------------------------------------------------- |
| `network.test.ts` | Direct backend origin and API base URL resolution for HTTP/HTTPS hosts |
| `operations-domain-workflows.test.ts` | Static workflow contract checks for classroom anomaly lifecycle UI, supervisor queue SLA behavior, after-sales evidence/compensation timeline, and stored-value safe receipt rendering (escaped text, no `v-html`) |

---

## 4. API Test Inventory

All files are in `API_tests/routes/`. Framework: Jest + Supertest.

| File                    | What it covers                                                                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `health.test.ts`        | `GET /health` — returns 200 with `status: ok`; database and Redis connectivity indicators                                                                                                                                          |
| `auth.test.ts`          | Login success and failure; token refresh; logout; `GET /api/auth/me`; change-password; rate limit enforcement on auth endpoints                                                                                                    |
| `api-signing.test.ts`   | Privileged endpoints reject unsigned traffic, enforce signature/timestamp validity, and reject cross-scope key usage (e.g., parking key on classroom/shipment signed endpoints)                                                  |
| `idempotency.test.ts`   | UUIDv4 idempotency key validation, deterministic replay behavior, collision isolation, and mutating-route coverage including departments/semesters/courses/classes import+create+update                                               |
| `master-data.test.ts`   | CRUD for departments, semesters, courses, classes, students; PII masking by role (logs in as each role, compares field visibility); bulk import end-to-end; CSV/XLSX export behavior                                                 |
| `jobs.test.ts`          | Job list and detail; shipment-sync run visibility in monitor listing; error report download; retry with idempotency key; export format negotiation (`?format=xlsx` and invalid format handling)                                      |
| `classroom.test.ts`     | Heartbeat POST; classroom list and stats; anomaly create/acknowledge/assign/resolve/escalate; state transition enforcement (e.g., cannot resolve without note); RBAC rejections                                                    |
| `parking.test.ts`       | Entry/exit sessions; lot stats; alert create/claim/close/escalate; detector-driven auto alerts for overtime/unsettled/duplicate/inconsistent sessions; metrics endpoint; SLA deadline presence; supervisor-queue escalation         |
| `fulfillment.test.ts`   | Fulfillment create with and without coupon; with and without stored value; status update; cancel; idempotency key dedup; 403 for CS agent on status update; membership tier discount applied; stored-value feature flag, high-value top-up policy checks, and receipt sanitization assertions |
| `shipment.test.ts`      | Shipment and parcel CRUD; manual status override; carrier sync trigger; after-sales ticket create/status update; evidence image upload (magic-byte rejection, 10MB rejection, dedup 409); compensation suggest/approve/reject with parent-child ID mismatch rejection tests |
| `observability.test.ts` | Metrics latest and history (including `api_latency_p95_ms` and `api_error_rate_percent` snapshots/history); alert list and acknowledge (idempotency required); threshold create/update/delete; log search; backup trigger/verify |
| `security-middleware.test.ts` | CORS allowlist behavior and TLS-required middleware behavior (health bypass + protected route enforcement)                                                                                                                            |

---

## 5. How to Run

### All tests (frontend + backend + API)

```bash
cd repo
# one-time setup if runtime secrets are missing
mkdir -p runtime-secrets
cp secrets/db_password.txt.example runtime-secrets/db_password.txt
cp secrets/db_root_password.txt.example runtime-secrets/db_root_password.txt
cp secrets/jwt_secret.txt.example runtime-secrets/jwt_secret.txt
cp secrets/encryption_key.txt.example runtime-secrets/encryption_key.txt

./run_tests.sh
```

PowerShell fallback (no `sh` required):

```powershell
Set-Location repo
$project = "campusops-test-ps-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
$env:TEST_PROJECT_NAME = $project
$compose = "docker compose -p $project -f docker-compose.yml -f docker-compose.test.yml"

Invoke-Expression "$compose down -v --remove-orphans"
Invoke-Expression "$compose run --rm --build --no-deps frontend-test-runner"
Invoke-Expression "$compose up -d --build --wait db redis"
Invoke-Expression "$compose run --rm --build --no-deps backend-unit-test-runner"
Invoke-Expression "$compose run --rm --build --no-deps api-test-runner"
Invoke-Expression "$compose down -v --remove-orphans"
```

This script:

1. Runs frontend Vitest tests in the `frontend-test-runner` Docker service.
2. Runs backend Vitest unit tests in the `backend-unit-test-runner` Docker service.
3. Runs Jest API tests via `api-test-runner` against MySQL + Redis test services.
4. Uses a unique `TEST_PROJECT_NAME` per run so test volumes do not collide with other Compose stacks.
5. Outputs a combined pass/fail summary.

### Frontend unit tests only

```bash
docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm --build --no-deps frontend-test-runner
```

### Backend unit tests only

```bash
docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm --build --no-deps backend-unit-test-runner
```

### API tests only

```bash
docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm api-test-runner
```

### Coverage report

After running unit tests with `--coverage`, the HTML report is written to `backend/coverage/index.html`.

---

## 6. Test Configuration

| Setting                | Value                                                                             |
| ---------------------- | --------------------------------------------------------------------------------- |
| Frontend Vitest config | `frontend/vitest.config.ts`                                                       |
| Backend Vitest config  | `backend/vitest.config.ts`                                                        |
| Jest config            | `API_tests/jest.config.ts`                                                        |
| Test database          | Separate MySQL container seeded with fixture data (see `docker-compose.test.yml`) |
| Test Redis             | Separate Redis container                                                          |
| Secrets                | Runtime secret files mounted from `repo/runtime-secrets/*.txt` (created from templates) plus test-only environment overrides in `docker-compose.test.yml` |

Additional security sufficiency checks:
- API signing scope isolation: wrong-scope keys must return authorization failure for signed endpoints.
- Idempotency namespace isolation: same idempotency key reused across different endpoint or payload contexts must not replay unrelated cached responses.
- Auth refresh hybrid contract: refresh succeeds with body token or secure cookie fallback, and fails when both are absent.
- Nested resource integrity: `/api/after-sales/:id/compensations/:cid/*` must reject mismatched parent/child IDs.
- Object-level ownership scope: customer-service agents are restricted to records they created/own for after-sales, shipment read context, evidence actions, and stored-value spend references.
- Middleware hardening: CORS allowlist and `TLS_REQUIRED` behavior are asserted in API tests.
- Log leakage prevention: request logger unit tests assert no sensitive headers/body fields are emitted.

---

## 7. Known Limitations and Scope Exclusions

| Limitation                                 | Notes                                                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend component runtime interactions still need browser E2E depth | Operational workflow contract tests exist, but full multi-step browser automation coverage remains limited. |
| WebSocket events not verified in API tests | Socket.IO event emission is not asserted in Supertest tests. Events are verified through the frontend manually.                                   |
| Carrier connector integration coverage is limited | Tests primarily validate simulation and queue behavior; full on-prem connector interoperability remains an environment-level verification activity. |
| No load or performance tests               | Not in scope. The system targets single-host LAN use with a small concurrent user base.                                                           |
| No end-to-end browser tests                | No Playwright or Cypress suite. Manual browser verification against the running stack is the acceptance gate.                                     |
| Backup restore test is manual              | The restore procedure is documented in `docs/restore.md`. Automated restore-test spin-up is not implemented in the CI test runner.                |
