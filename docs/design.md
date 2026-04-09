# Architecture Decision Record — CampusOps Fulfillment & Operations Platform

**Version:** 1.0  
**Date:** 2026-03-31  
**Status:** Approved

Deployment topology source of truth:
- `repo/docs/deployment.md`

---

## 1. Monorepo Packaging Inside `repo/`

**Decision:** All runnable application code lives inside `repo/`. The outer `TASK-44/` directory is the submission wrapper containing only docs, sessions, metadata, and prompt artifacts. `cd repo && docker compose up` is the single canonical startup command.

**Rationale:**
- Separating submission artifacts from runtime code prevents QA confusion.
- A single `docker-compose.yml` at `repo/` root declares every service, port, and volume.
- No runtime code references paths outside of `repo/`.

**Directory map inside `repo/`:**
```
repo/
├── frontend/          # Vue 3 + TypeScript + Vite SPA
├── backend/           # Express + TypeScript API server
├── backend/database/  # Prisma schema, migrations, seeders
├── backend/unit_tests/# Backend Vitest unit tests
├── frontend/unit_tests/# Frontend Vitest unit/component tests
├── API_tests/         # Supertest API functional test suites
├── docker-compose.yml # All services declared here
└── README.md          # Startup and verification guide
```

---

## 2. Service Boundaries

The system is decomposed into the following logical services, each a separate Docker container:

| Service | Image / Technology | Responsibility |
|---|---|---|
| `frontend` | Node 18 (Vite dev) / Nginx (prod) | Vue 3 SPA — all UI screens |
| `backend` | Node 18 + Express + TypeScript | REST APIs, Socket.IO server, job scheduling |
| `db` | MySQL 8 | Persistent relational data |
| `redis` | Redis 7 | BullMQ job queue, session store, rate limit counters, idempotency cache |
| `reverse-proxy` | Nginx | TLS termination, HTTP->HTTPS redirect, ingress routing for `/`, `/api`, `/health`, and `/socket.io` |

**Internal networking:** All services communicate over a dedicated Docker bridge network (`campusops-net`). Only `reverse-proxy` exposes host ports (`80` redirect, `443` TLS). Backend and frontend stay internal-only.

**Why every runtime dependency is containerized:**
- Zero host-machine dependency — operators do not install Node, MySQL, or Redis manually.
- Identical environment between development and production on-prem.
- Docker volumes ensure data persistence across container restarts.
- Docker secrets provide credential isolation from application code.

---

## 3. Real-Time Event Design

**Technology choice:** Socket.IO (built on WebSocket with fallback to long-polling).

**Why Socket.IO over raw WebSocket:**
- Built-in room/namespace support maps cleanly to domain channels.
- Automatic reconnection with exponential backoff out of the box.
- Works through the TLS ingress endpoint (`https://<host>/socket.io`) in LAN deployments.

**Channels / Namespaces:**

| Namespace | Purpose | Subscribers |
|---|---|---|
| `/classroom` | Heartbeat updates, online/offline transitions, anomaly events | Classroom Supervisors, Administrators |
| `/parking` | Space count updates, exception alerts, escalation events | Operations Managers, Administrators |
| `/jobs` | Background job progress (import %, sync status) | Authenticated operators |
| `/alerts` | Threshold breach alerts, banner notifications | All authenticated users |
| `/supervisor-queue` | Escalated parking/classroom alerts | Classroom Supervisors, Administrators |

**Event flow:**
1. External hardware/systems POST events to the backend REST API (with API signing).
2. Backend persists the event to MySQL.
3. Backend emits the event to the relevant Socket.IO namespace.
4. Connected Vue clients receive the event and update Pinia store state reactively.
5. UI components re-render from store — no polling required.

**Heartbeat mechanism:** Each classroom hardware node is expected to POST `/api/classrooms/:id/heartbeat` every 60 seconds. The backend runs a 90-second stale-detector job that transitions classrooms to `offline` if no heartbeat arrives.

---

## 4. Storage Strategy

**Local object storage:**
- Files are written to a Docker volume mounted at `/data/storage` inside the `backend` container.
- Directory structure: `/data/storage/{year}/{month}/{entity_type}/{uuid}.jpg`
- Upload endpoint validates: MIME type (JPEG/PNG only), file size (≤10 MB), perceptual hash for duplicate detection.
- Sharp (Node.js) handles image compression and cropping before write.
- The database stores only the relative path and metadata (hash, size, mime, uploaded_by, timestamp). The physical file and DB record are written in the same request; on failure, the file is deleted.

**Relational data (MySQL 8):**
- Prisma ORM manages schema and migrations. Migration files are committed to `database/migrations/`.
- All foreign keys have cascading or restrict behavior explicitly defined.
- Indexes are declared on all foreign keys and high-cardinality filter columns.
- Stored value balances are stored as encrypted blobs (AES-256-GCM) in a dedicated column; decryption happens in the service layer, never in SQL.

**Redis:**
- BullMQ uses Redis for job queues. Queue names use the `campusops-` prefix.
- Rate limiter uses Redis sliding window counters.
- Idempotency key cache uses Redis with 24-hour TTL.
- Session tokens use Redis with configurable TTL (default 8 hours).

---

## 5. Security Model

**Authentication:**
- Username/password login. Passwords hashed with bcrypt (cost factor 12).
- JWT access tokens (15-minute expiry) + Redis-backed refresh tokens (8-hour expiry).
- Access tokens carry `campusId`; request context propagates this claim for data partition enforcement.
- All tokens validated in Express middleware before any route handler.

**Campus/Tenant isolation:**
- Core domain records include campus partition keys (`campusId`) on users, students, fulfillment, shipments, after-sales tickets, classrooms, anomaly events, parking lots, parking sessions, and parking alerts.
- Service-layer queries apply campus scope from authenticated request context before object-level role checks.
- Socket.IO real-time streams for classroom and parking domains are emitted to campus-specific rooms to prevent cross-campus event leakage.

**Role-Based Access Control (RBAC):**
- Five roles: `administrator`, `operations_manager`, `classroom_supervisor`, `customer_service_agent`, `auditor`.
- Role permissions are enforced in middleware using a permission matrix. Controllers never check roles directly.
- Route-level and field-level guards are separate concerns.

**Field-level masking:**
- Applied in serialization layer (DTO transformers). Database records always store full data.
- Masking rules are defined in `src/lib/masking.ts` and reused via `src/lib/student-serialization.ts` for after-sales and fulfillment read payloads.

**Encryption at rest:**
- Stored value balances: AES-256-GCM, key from Docker secret `ENCRYPTION_KEY`.
- Audit log entries: AES-256-GCM, same key. Encrypted before INSERT, decrypted after SELECT.
- No plaintext sensitive data is logged.

**LAN transport:**
- Default deployment is TLS-first with reverse-proxy ingress on `443`.
- Port `80` is redirect-only (`http` -> `https`).
- Backend additionally supports `ENFORCE_TLS=true` request-level enforcement behind the proxy.

**API signing for privileged integrations:**
- Hardware connectors (classroom heartbeat, parking event ingest) must sign requests with HMAC-SHA256 using a pre-shared secret stored in the database.
- Backend verifies signatures in a dedicated middleware before processing ingest payloads.

**Rate limiting:**
- `express-rate-limit` with Redis store: 100 req/min per IP globally, 20 req/min on `/api/auth/*`.
- Circuit breakers (`opossum`) wrap all external carrier adapter calls.

---

## 6. Testing Strategy

**Unit tests (`backend/unit_tests/` and `frontend/unit_tests/`):**
- Framework: Vitest
- Scope: business logic services (compensation calculation, coupon application, fee template computation, PII masking, escalation timer logic, stored value deduction).
- Database calls are replaced with in-memory fakes (repository pattern makes this clean).
- Target coverage: ≥90% on service layer.

**API functional tests (`API_tests/`):**
- Framework: Supertest + Jest
- Scope: full HTTP request/response cycle against a real test database (MySQL container seeded with fixtures).
- Covers success paths, validation errors, auth failures, RBAC rejections, idempotency, and rate limiting.
- Run with `docker compose -f docker-compose.test.yml up --abort-on-container-exit`.

**Test runner:**
- `repo/run_tests.sh` runs both unit and API test suites sequentially and outputs a pass/fail summary.
- The runner sets `TEST_PROJECT_NAME` to a unique value per run so MySQL/Redis test volumes are isolated and cannot collide with other Compose projects.

---

## 7. Backup / Restore Approach

**Backup job:**
- Runs daily at 02:00 (configurable) via BullMQ repeatable job.
- Produces: `backup_YYYY-MM-DD_HHmmss.sql` (database dump) + `backup_YYYY-MM-DD_HHmmss.json` (row-count manifest).
- Written to `/backups` (separate Docker volume, maps to a separate host disk path).
- Cleanup job deletes backup dump/manifest pairs older than 14 days immediately after each successful backup.

**Automated restore verification:**
- After each daily backup, the backup worker runs `verifyBackup(...)` with restore smoke testing enabled.
- Verification imports the dump into a temporary database, confirms import viability, and writes pass/fail details.
- Verification outcome updates `BackupRecord.verifyStatus` and is emitted through worker logs.

**Manual restore:**
- Restore workflow is documented in `repo/docs/restore.md` and linked from `repo/docs/runbook.md`.

---

## 8. Observability Model

**Metrics:**
- Current persisted metrics include CPU load percentage, memory used/free MB, active jobs count, open parking alerts, and open after-sales tickets.
- Metrics snapshots are exposed via authenticated API endpoints (`GET /api/metrics`, `GET /api/metrics/:name/history`).
- Threshold checks run in background workers and create alert-history records on breach.

**Structured logs:**
- Winston outputs JSON logs to stdout (captured by Docker) and to `/logs/{date}.log` inside the container (mounted volume).
- Log levels: `error`, `warn`, `info`, `debug`. Production default: `info`.
- Log retention: a daily cleanup job deletes log files older than 30 days.
- Searchable via `GET /api/logs?query=&severity=&service=&fromDate=&toDate=` endpoint.

**Alert engine:**
- Administrators configure metric thresholds (e.g., CPU usage or open alert counts) in the settings screen.
- A background job evaluates metrics every 30 seconds.
- Breaches emit a WebSocket event to `/alerts` namespace → frontend shows a persistent banner + plays an audible chime (Web Audio API).
- Alert history is stored in the database for review.

---

## 9. Background Job Architecture

All background jobs use BullMQ with Redis as the broker. Jobs are defined in `backend/src/jobs/` and registered at server startup.

| Job Name | Trigger | Purpose |
|---|---|---|
| `bulk-import` | API call (on-demand) | Process Excel/CSV uploads, validate rows, insert, generate error report |
| `shipment-sync` | Repeatable (every 15min per carrier) | Poll on-prem carrier connector for tracking updates |
| `escalation-checker` | Repeatable (every 60s) | Detect overdue parking/classroom alerts and escalate |
| `classroom-heartbeat-checker` | Repeatable (every 30s) | Mark classrooms offline if heartbeat stale |
| `backup` | Repeatable (daily 02:00) | MySQL dump + manifest + restore smoke verification |
| `log-retention-cleanup` | Repeatable (daily 03:00) | Delete log files older than 30 days |
| `metric-alert-check` | Repeatable (every 30s) | Evaluate metrics against thresholds, emit alerts |

Job progress and status are broadcast via `/jobs` Socket.IO namespace. The job monitor screen shows all active/completed/failed jobs with logs.
