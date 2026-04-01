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
| `shipment.test.ts`          | `simulateCarrierResponse` age-bucket logic (pending/in_transit/out_for_delivery/delivered), parcel status transition validation, SLA at-risk detection                  |
| `observability.test.ts`     | Metric snapshot collection, threshold evaluation (gt/lt/gte/lte operators), alert creation on breach, backup manifest validation, log retention cutoff date calculation |

Frontend unit tests are in `frontend/unit_tests/`.

| File              | What it covers                                                         |
| ----------------- | ---------------------------------------------------------------------- |
| `network.test.ts` | Direct backend origin and API base URL resolution for HTTP/HTTPS hosts |

---

## 4. API Test Inventory

All files are in `API_tests/routes/`. Framework: Jest + Supertest.

| File                    | What it covers                                                                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `health.test.ts`        | `GET /health` — returns 200 with `status: ok`; database and Redis connectivity indicators                                                                                                                                          |
| `auth.test.ts`          | Login success and failure; token refresh; logout; `GET /api/auth/me`; change-password; rate limit enforcement on auth endpoints                                                                                                    |
| `api-signing.test.ts`   | Privileged endpoints reject unsigned traffic and accept valid HMAC-signed requests with active integration keys                                                                                                                    |
| `idempotency.test.ts`   | UUIDv4 idempotency key validation, replay behavior, and deduplication cache semantics on mutating endpoints                                                                                                                        |
| `master-data.test.ts`   | CRUD for departments, semesters, courses, classes, students; PII masking by role (logs in as each role, compares field visibility); bulk import end-to-end; CSV export                                                             |
| `jobs.test.ts`          | Job list and detail; error report download; retry with idempotency key; 403 for non-admin roles                                                                                                                                    |
| `classroom.test.ts`     | Heartbeat POST; classroom list and stats; anomaly create/acknowledge/assign/resolve/escalate; state transition enforcement (e.g., cannot resolve without note); RBAC rejections                                                    |
| `parking.test.ts`       | Entry/exit sessions; lot stats; alert create/claim/close/escalate; metrics endpoint; SLA deadline presence in response; supervisor-queue escalation                                                                                |
| `fulfillment.test.ts`   | Fulfillment create with and without coupon; with and without stored value; status update; cancel; idempotency key dedup; 403 for CS agent on status update; membership tier discount applied                                       |
| `shipment.test.ts`      | Shipment and parcel CRUD; manual status override; carrier sync trigger; after-sales ticket create/status update; evidence image upload (success, 10MB rejection, dedup 409); compensation suggest/approve/reject; SLA at-risk flag |
| `observability.test.ts` | Metrics latest and history; alert list and acknowledge; threshold create/update/delete; log search with filters; backup trigger and verify; 403 on backup trigger for non-admin                                                    |

---

## 5. How to Run

### All tests (frontend + backend + API)

```bash
cd repo
bash run_tests.sh
```

This script:

1. Runs frontend Vitest tests in the `frontend-test-runner` Docker service.
2. Runs backend Vitest unit tests in the `backend-unit-test-runner` Docker service.
3. Runs Jest API tests via `api-test-runner` against MySQL + Redis test services.
4. Outputs a combined pass/fail summary.

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
| Secrets                | Test-only values injected via environment variables in `docker-compose.test.yml`  |

---

## 7. Known Limitations and Scope Exclusions

| Limitation                                 | Notes                                                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend unit test scope is narrow         | Current frontend unit tests focus on transport URL resolution; broad component E2E/browser coverage is still manual.                              |
| WebSocket events not verified in API tests | Socket.IO event emission is not asserted in Supertest tests. Events are verified through the frontend manually.                                   |
| Carrier sync is simulated                  | `simulateCarrierResponse` uses pure age-bucket logic — no real network calls. Tests verify the simulation logic, not actual carrier connectivity. |
| No load or performance tests               | Not in scope. The system targets single-host LAN use with a small concurrent user base.                                                           |
| No end-to-end browser tests                | No Playwright or Cypress suite. Manual browser verification against the running stack is the acceptance gate.                                     |
| Backup restore test is manual              | The restore procedure is documented in `docs/restore.md`. Automated restore-test spin-up is not implemented in the CI test runner.                |
