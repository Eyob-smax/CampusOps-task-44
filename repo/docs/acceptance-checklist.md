# Acceptance Checklist — CampusOps Fulfillment & Operations Platform

Maps every requirement from the original prompt to its implementation evidence.

---

## 1. Deployment & Infrastructure

| Requirement                                         | Status | Evidence                                                                                                                                           |
| --------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runs entirely on a disconnected local network       | ✓      | `docker-compose.yml` — no internet dependency; internal bridge networking; carrier connector can target on-prem endpoints only                    |
| Docker Compose single-command startup               | ✓      | `docker compose up` starts all 5 containers in dependency order                                                                                    |
| No host-level tooling required                      | ✓      | All runtime inside containers; `README.md` Prerequisites section                                                                                   |
| MySQL persistence                                   | ✓      | `campusops-db` container; `backend/prisma/schema.prisma` (30+ models)                                                                              |
| Redis for queues and caching                        | ✓      | `campusops-redis` container; BullMQ 8 queues; rate-limit and idempotency stores                                                                    |
| Frontend served by containerized static runtime     | ✓      | `frontend/Dockerfile` — Vue 3 SPA build served on port 80                                                                                          |
| Docker secrets (never committed as runtime files)   | ✓      | Templates in `repo/secrets/*.example`; runtime files in `repo/runtime-secrets/*.txt`; compose mounts to `/run/secrets/*` |
| Database schema applied on first boot               | ✓      | `docker-entrypoint.sh`: migration-first (`prisma migrate deploy`) with non-production fallback to `prisma db push` when migrations are absent      |
| Seed accounts created on first boot when configured | ✓      | `docker-entrypoint.sh`: `node dist/database/seeders/seed.js`; `seed.ts` requires non-placeholder `SEED_*_PASSWORD` values                          |
| TLS-first LAN operation                             | ✓      | `README.md` LAN/TLS notes; `reverse-proxy/nginx.conf` redirects 80 to 443 and proxies frontend/backend                                            |

---

## 2. Role-Based Access Control

| Requirement                      | Status | Evidence                                                                     |
| -------------------------------- | ------ | ---------------------------------------------------------------------------- |
| Administrator role               | ✓      | `src/lib/permissions.ts`; full CRUD + settings + user management             |
| Operations Manager role          | ✓      | `src/lib/permissions.ts`; warehouses, carriers, zones, templates, membership |
| Classroom Supervisor role        | ✓      | `src/lib/permissions.ts`; classrooms, anomalies, supervisor queue            |
| Customer Service Agent role      | ✓      | `src/lib/permissions.ts`; after-sales tickets, evidence, compensations       |
| Auditor role                     | ✓      | `src/lib/permissions.ts`; read-only audit log access                         |
| `requirePermission()` middleware | ✓      | `src/middleware/auth.middleware.ts`; applied on every protected route        |

---

## 3. Authentication & Security

| Requirement                                            | Status | Evidence                                                                                     |
| ------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------- |
| Username/password login with salted hashing            | ✓      | `auth.service.ts`: bcrypt 12 rounds; `POST /api/auth/login`                                  |
| JWT access + refresh tokens                            | ✓      | `auth.service.ts`: 15-min access, 8-h refresh; Redis-backed revocation                       |
| Campus-scoped request context                          | ✓      | `AuthenticatedUser.campusId` in auth token/middleware; campus-scoped filters in core services |
| AES-256-GCM encryption for stored value and audit logs | ✓      | `src/lib/encryption.ts`; used in `stored-value.service.ts` and `audit.service.ts`            |
| Field-level PII masking                                | ✓      | `src/lib/masking.ts` + `src/lib/student-serialization.ts`; applied to student, fulfillment, and after-sales read payloads per role |
| API signing for hardware/carrier integrations          | ✓      | `src/middleware/api-signing.middleware.ts`; HMAC-SHA256; `IntegrationKey` model              |
| Rate limiting                                          | ✓      | `src/middleware/rate-limit.middleware.ts`; 100/min global, 20/min auth; Redis sliding window |
| Circuit breakers                                       | ✓      | `src/lib/circuit-breaker.ts` (opossum); wraps all carrier adapter calls                      |
| Idempotency keys                                       | ✓      | `src/middleware/idempotency.middleware.ts`; Redis-backed atomic reservation + cached replay, 24h TTL, UUIDv4 required, `IDEMPOTENCY_IN_PROGRESS` on active duplicates |

---

## 4. Real-Time Dashboard

| Requirement                                     | Status | Evidence                                                                                               |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| Vue.js web console                              | ✓      | `frontend/src/` — Vue 3 + TypeScript + Element Plus                                                    |
| Classroom online status                         | ✓      | `classroom.service.ts`: heartbeat-based (90s stale = offline); `ClassroomOperationsView.vue`           |
| Recognition confidence indicator                | ✓      | `ClassroomOperationsView.vue`: confidence badge per classroom card                                     |
| Anomaly event stream                            | ✓      | `AnomalyQueueView.vue`; Socket.IO `/classroom` namespace; `anomaly:created` / `anomaly:updated` events |
| Acknowledge, assign, resolve with required note | ✓      | `anomaly.service.ts`: state machine; resolution note min 20 chars; enforced in `AnomalyQueueView.vue` |
| WebSocket real-time updates                     | ✓      | `src/lib/socket.ts`; namespaces: `/classroom`, `/parking`, `/supervisor-queue`, `/alerts`, `/jobs`; classroom/parking emissions are campus-room scoped |
| Second-level audible banner alert               | ✓      | `frontend/src/App.vue`: `useAlertSocket.ts` composable; audible chime on threshold/system alert events  |

---

## 5. Classroom Operations

| Requirement                                                  | Status    | Evidence                                                                          |
| ------------------------------------------------------------ | --------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Classroom online/offline status                              | ✓         | `classroom.service.ts` + `heartbeat.worker.ts` (marks stale > 90s)                |
| Hardware heartbeat endpoint                                  | ✓         | `POST /api/classrooms/heartbeat/:nodeId`                                          |
| Campus isolation for classroom and anomaly reads             | ✓         | `classroom.service.ts` + `anomaly.service.ts` enforce requester `campusId` filters; covered by `API_tests/routes/classroom.test.ts` |
| Anomaly lifecycle: open → acknowledged → assigned → resolved → escalated | ✓      | `anomaly.service.ts` state machine; all transitions audit-logged |
| Auto-escalation after 30 min unacknowledged                  | ✓         | `heartbeat.worker.ts` escalation job; `config.classroom.anomalyEscalationMinutes` |
| Supervisor queue                                             | ✓         | Socket.IO `/supervisor-queue` namespace; `AnomalyQueueView.vue`                   |
| Timeline history per anomaly                                 | ✓         | `AnomalyTimelineEntry` Prisma model; drawer in `AnomalyQueueView.vue`             |

---

## 6. Parking Operations

| Requirement                                                                                    | Status | Evidence                                                                           |
| ---------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| Available-space counts                                                                         | ✓      | `GET /api/parking/dashboard`; `GET /api/parking/lots/:id/stats`; `ParkingOperationsView.vue` |
| Turnover (entries/hour)                                                                        | ✓      | `parking.service.ts` `getStats()`; displayed in `ParkingOperationsView.vue`        |
| Exception alert types: no plate, overtime, unsettled, duplicate plate, inconsistent entry/exit | ✓      | `parking.service.ts` detector pipeline (`runParkingExceptionDetectors`) + `parking-escalation.worker.ts` |
| Campus isolation for lots, sessions, and alerts                                                  | ✓      | `parking.service.ts` + `alert.service.ts` enforce requester `campusId` filters; covered by `API_tests/routes/parking.test.ts` |
| 15-minute SLA before escalation                                                                | ✓      | `parking-escalation.worker.ts` (30s poll); `claimedAt` timestamp on `ParkingAlert` |
| Supervisor queue escalation                                                                    | ✓      | Socket.IO `/supervisor-queue` `parking:escalated` event; `SupervisorQueueView.vue` |
| Claim and close with mandatory note                                                            | ✓      | `PATCH /api/parking-alerts/:id/claim`; `PATCH /api/parking-alerts/:id/close`       |

---

## 7. Shipping Fee Templates & Logistics

| Requirement                                               | Status | Evidence                                                                                 |
| --------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| Shipping fee templates (weight, item count, region, tier) | ✓      | `ShippingTemplate` model; `shipping.service.ts`; `ShippingTemplatesView.vue`             |
| Base fee + per-lb rate + Alaska/Hawaii surcharges         | ✓      | `ShippingTemplate`: `baseFee`, `perKgRate`, `surcharge` fields in `prisma/schema.prisma` |
| Delivery zones with non-serviceable ZIP codes             | ✓      | `DeliveryZone` model; `delivery-zone.service.ts`                                         |
| Warehouses                                                | ✓      | `Warehouse` model; `warehouse.service.ts`; `WarehousesView.vue`                          |
| Carrier options                                           | ✓      | `Carrier` model; `carrier.service.ts`; `CarriersView.vue`                                |

---

## 8. Membership & Stored Value

| Requirement                                       | Status | Evidence                                                                             |
| ------------------------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| Tiered membership with benefits and growth points | ✓      | `MembershipTier` model; `membership.service.ts`; `TiersView.vue`                     |
| Member-only pricing at fulfillment                | ✓      | `fulfillment.service.ts` pricing pipeline: tier discount applied first               |
| Coupon codes at fulfillment                       | ✓      | `coupon.service.ts`; single coupon per request; `CouponsView.vue`                    |
| Stored value: system-wide flag                    | ✓      | `SystemSetting: stored_value_enabled`; `stored-value.service.ts`                     |
| Top-up and spend                                  | ✓      | `POST /api/stored-value/:studentId/top-up`; `POST /api/stored-value/:studentId/spend` |
| Atomic stored-value mutation under concurrency    | ✓      | `stored-value.service.ts`: compare-and-set transactional updates with conflict handling |
| High-value top-up approval policy                 | ✓      | `stored-value.service.ts`: amount > configured threshold requires admin/ops approver context |
| AES-256 encrypted balance at rest                 | ✓      | `stored-value.service.ts` uses `encrypt()`/`decrypt()` from `lib/encryption.ts`      |
| Balance feedback in UI                            | ✓      | `FulfillmentDetailView.vue`; stored value balance shown at checkout                  |

---

## 9. Fulfillment Requests

| Requirement                                                    | Status | Evidence                                                                               |
| -------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------- | -------- |
| Checkout-like fulfillment request flow                         | ✓      | `fulfillment.service.ts`; state machine: pending → processing → shipped → delivered / cancelled |
| Pricing: tier discount → coupon → stored value                 | ✓      | `fulfillment.service.ts` pricing pipeline in `createFulfillmentRequest()` |
| Shipping selection validation (`zoneId` + `tier`) and active zone enforcement | ✓      | `fulfillment.service.ts`: rejects incomplete pair and invalid/inactive zones (`422 INVALID_SHIPPING_ZONE`) |
| Idempotency on create/update                                   | ✓      | Applied on mutating routes across admin/users/settings/keys, students create+update, anomalies, parking alerts, fulfillment create/status/cancel, shipment/parcels, after-sales ticket+compensation, observability alert acknowledge, jobs retry, backups, thresholds; middleware provides race-safe single-writer semantics for concurrent duplicates |
| Role-based PII masking on fulfillment read responses           | ✓      | `modules/fulfillment/fulfillment.controller.ts` uses `student-serialization`; verified in `API_tests/routes/fulfillment.test.ts` |
| Bulk import master data (students) with row-level error report | ✓      | `POST /api/students/import`; `import.worker.ts`: CSV/Excel validation, error report CSV, async job progress |
| Student import campus isolation in async worker path            | ✓      | `import.worker.ts`: queue payload carries `campusId`; cross-campus student-number updates are rejected |
| Export master data                                             | ✓      | `GET /api/students/export` and peer master-data exports support `?format=csv|xlsx` (default CSV) |

---

## 10. Shipments & After-Sales

| Requirement                                                  | Status | Evidence                                                                                           |
| ------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------- |
| Shipment records linked to parcels                           | ✓      | `Shipment` → `Parcel` (1:many) in `prisma/schema.prisma`                                           |
| Parcels linked to after-sales tickets                        | ✓      | `AfterSalesTicket.parcelId` FK in schema                                                           |
| Tracking numbers stored                                      | ✓      | `Parcel.trackingNumber` field                                                                      |
| Internal carrier sync (no internet)                          | ✓      | `carrier-sync.service.ts`: connector mode posts to on-prem `carrier.connectorUrl`, with optional simulation fallback |
| Shipment sync every 15 minutes (configurable)                | ✓      | `jobs/index.ts` + `config.shipmentSync.intervalMinutes`; `campusops-shipment-sync` BullMQ queue   |
| After-sales ticket types: delay, dispute, lost_item          | ✓      | `AfterSalesTicketType` enum; `after-sales.service.ts`                                              |
| After-sales/evidence/compensation response envelope consistency | ✓    | Controllers return `{ success: true, data }` contract across list/detail/create/update endpoints   |
| Role-based PII masking on after-sales read responses           | ✓      | `modules/after-sales/after-sales.controller.ts` uses `student-serialization`; verified in `API_tests/routes/shipment.test.ts` |
| Evidence upload: JPEG/PNG, 10MB, sharp compress, aHash dedup | ✓      | `evidence.service.ts`; magic-byte check, sharp (max 1920px, quality 80), Hamming <= config threshold (default 10) |
| SLA timers on ticket timeline                                | ✓      | `after-sales.service.ts` `computeSlaStatus()`; delay=72h, dispute=48h, lost_item=96h; at_risk <4h  |
| Automated compensation suggestions                           | ✓      | `compensation.service.ts` `suggestCompensation()`; $10 for ≥48h delay; $50 global cap              |
| Manual compensation approval                                 | ✓      | `PATCH /api/after-sales/:id/compensations/:cid/approve`; enforces parent-child `(ticketId,cid)` binding, permission-tier limits (limited=$25, full=$50, override=∞), and CS-agent ticket ownership scope |
| Credit compensation tops up stored value                     | ✓      | `compensation.service.ts`: approved credit calls `storedValueService.topUp()`                      |

---

## 11. Observability

| Requirement                                            | Status | Evidence                                                                                               |
| ------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------ |
| Runtime metrics (CPU, memory, p95 latency, error rate, active jobs, open alerts/tickets) | ✓      | `metrics.service.ts`: `cpu_utilization_percent`, `api_latency_p95_ms`, `api_error_rate_percent`, memory, active jobs, open parking alerts, open after-sales tickets |
| Configurable alert thresholds                          | ✓      | `threshold.service.ts`; operators: `>`, `<`, `>=`, `<=`, `==` (legacy `gt`/`lt`/`gte`/`lte`/`eq` accepted); `metric-alert.worker.ts` (30s poll) |
| On-screen alert banners                                | ✓      | Socket.IO `/alerts` namespace; `useAlertSocket.ts`; `App.vue` alert banner                             |
| Audible workstation alert                              | ✓      | `App.vue`: `AudioContext` chime on threshold/system alert events                                       |
| Searchable application logs (30-day retention)         | ✓      | `log.service.ts`: reads `YYYY-MM-DD.log` files; 7 filter types; `log-retention.worker.ts` at 03:00 UTC |
| Scheduled daily backup at 02:00 UTC                    | ✓      | `jobs/index.ts` + `backup.worker.ts`; `campusops-backup` BullMQ cron                                  |
| 14-day backup retention                                | ✓      | `backup.service.ts` `enforceRetention()`                                                               |
| Backup verification                                    | ✓      | `POST /api/backups/:id/verify`; strict current-schema table and row-count manifest validation + restore smoke checks |
| Separate local disk storage                            | ✓      | `backups-data` Docker volume; `storage-data` volume for evidence files                                 |

---

## 12. File Handling

| Requirement                              | Status | Evidence                                                                |
| ---------------------------------------- | ------ | ----------------------------------------------------------------------- |
| Local object storage (mounted disk path) | ✓      | `storage-data` Docker volume → `/data/storage` in container             |
| Image compression/cropping               | ✓      | `evidence.service.ts`: sharp, max 1920px, quality 80                    |
| JPEG/PNG only (format check)             | ✓      | `evidence.service.ts`: magic-byte validation (not just extension check) |
| 10MB per file limit                      | ✓      | multer `limits.fileSize: 10 * 1024 * 1024`                              |
| Perceptual hash deduplication            | ✓      | `evidence.service.ts`: aHash 8×8; Hamming distance <= config threshold (default 10) -> HTTP 409 |

---

## 13. Job Monitor

| Requirement                             | Status | Evidence                                                                                                                                                                                                |
| --------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Background job monitor in admin console | ✓      | `GET /api/jobs`; `JobMonitorView.vue`                                                                                                                                                                   |
| 8 background jobs registered            | ✓      | `jobs/index.ts`: bulk-import, shipment-sync (15min default), escalation-checker (60s), heartbeat-checker (30s), parking-sla-check (30s), backup (02:00 UTC), metric-alert-check (30s), log-retention (03:00 UTC) |
| Campus-scoped job visibility and detail access | ✓ | `job.controller.ts` + `job.service.ts`: list/detail/error-report filtered by authenticated `campusId` |
| Manual failed-job retry trigger         | ✓      | `POST /api/jobs/:id/retry` (requires `jobs:manage` and `X-Idempotency-Key`)                                                                                                                            |
| Campus-safe failed-job retry            | ✓      | Retry preserves original job `campusId` in queue payload and blocks cross-campus retries |

---

## 14. Audit Logging

| Requirement                  | Status | Evidence                                                                   |
| ---------------------------- | ------ | -------------------------------------------------------------------------- |
| All state transitions logged | ✓      | `audit.service.ts`; `AuditLog` model; actor ID, action, before/after state |
| Audit log encrypted at rest  | ✓      | `audit.service.ts`: AES-256-GCM metadata field                             |
| Auditor read-only access     | ✓      | `GET /api/admin/audit`; `requirePermission('audit:read')`                  |
| PII reveal uses audit-log primary key + justification | ✓      | `POST /api/admin/audit/reveal/:id` resolves by `AuditLog.id` and requires justification; covered by `API_tests/routes/auth.test.ts` |

---

## 15. Tests

| Requirement                               | Status | Evidence                                                                                                     |
| ----------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| Frontend unit tests                       | ✓      | `frontend/unit_tests/network.test.ts` — Vitest coverage for direct backend/API URL resolution                |
| Backend unit tests                        | ✓      | `backend/unit_tests/` — Vitest service-layer logic tests                                                     |
| API functional tests                      | ✓      | `API_tests/routes/` — Jest + Supertest full HTTP cycle tests including API signing and idempotency           |
| Test runner script                        | ✓      | `run_tests.sh`; runs frontend Vitest + backend Vitest + Jest API suites sequentially; per-run isolated `TEST_PROJECT_NAME` volumes prevent db/redis lock collisions; exit code 1 on failure |
| `jest.config.js` for TypeScript API tests | ✓      | `backend/jest.config.js`; ts-jest preset; testMatch `**/API_tests/**/*.test.ts`                              |

---

## 16. Documentation

| Requirement                 | Status | Evidence                                                                                                                                                                         |
| --------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/design.md`            | ✓      | Architecture, service decomposition, data flow, WebSocket namespaces                                                                                                             |
| `docs/api-spec.md`          | ✓      | All ~80 endpoints with method, path, auth, request/response shape                                                                                                                |
| `docs/test-plan.md`         | ✓      | Test inventory by module; coverage targets; execution instructions                                                                                                               |
| `docs/deployment.md`        | ✓      | Docker Compose startup, environment variables, production notes                                                                                                                  |
| `docs/runbook.md`           | ✓      | On-call procedures, job failure playbooks, alert response guides                                                                                                                 |
| `docs/backup.md`            | ✓      | Backup schedule, storage path, manifest format                                                                                                                                   |
| `docs/restore.md`           | ✓      | Step-by-step restore from backup manifest                                                                                                                                        |
| `docs/cert-rotation.md`     | ✓      | JWT secret rotation and reverse-proxy TLS certificate rotation                                                                                                                       |
| `docs/retention-cleanup.md` | ✓      | Log and backup retention policies                                                                                                                                                |
| `docs/troubleshooting.md`   | ✓      | Common issues, container health checks, log inspection                                                                                                                           |
| `README.md`                 | ✓      | Startup command, services/ports, seeded account configuration, verification checklist, test execution, backup/restore, file upload rules, LAN/TLS notes, operational assumptions |
| `questions.md`              | ✓      | 15 ambiguities with explicit decisions (Q1–Q15)                                                                                                                                  |
| Session artifacts           | ✓      | `sessions/develop-1.json` through `develop-7.json`                                                                                                                               |

---

## QA Verification Path

The complete end-to-end QA path requires secrets plus configured seeded passwords:

```bash
cd TASK-44/repo
docker compose up               # All 5 containers start; schema pushed; seed runs
# -> open https://localhost     # Login page appears (self-signed cert in disconnected LAN mode)
# → login as admin/<SEED_ADMIN_PASSWORD>
# → verify Jobs screen shows 8 background jobs
# → trigger a manual backup via API or Jobs screen
# → verify backup passes with "passed": true
./run_tests.sh                 # Frontend + backend unit tests (Vitest) and API tests (Jest)
```

No internet access is required. No host tools are required beyond Docker Engine 24+ and Docker Compose v2+.
