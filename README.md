# CampusOps Fulfillment & Operations Platform

A production-grade, LAN-only fulfillment and operations platform for district staff managing classroom operations, parking, logistics, and on-premise fulfillment.

---

## Prerequisites

- Docker Engine 24+
- Docker Compose v2+
- No other host-level dependencies required

---

## Secrets Setup

The repository includes placeholder secret files in `secrets/` so the stack can start immediately after clone.

Three Docker secrets are used:

| File                         | Content                                       |
| ---------------------------- | --------------------------------------------- |
| `secrets/encryption_key.txt` | 64-character hexadecimal string (AES-256 key) |
| `secrets/db_password.txt`    | Database password for MySQL                   |
| `secrets/jwt_secret.txt`     | JWT signing secret                            |

Replace placeholders before real deployments.

---

## Startup

```bash
cd repo
docker compose up --build
```

This single command starts all four containers in dependency order: MySQL, Redis, backend, frontend. On first boot, Prisma migrations run automatically and the seed user accounts are created.

Seeded users are created only when `SEED_*_PASSWORD` values are configured (non-placeholder).

> **Do not run `npm install` outside Docker.** Install/build/test execution is containerized.

---

## Services and Ports

| Container            | Host Port  | Technology                                | Notes                                                                |
| -------------------- | ---------- | ----------------------------------------- | -------------------------------------------------------------------- |
| `campusops-frontend` | 80         | Vue 3 SPA + Node static server            | Main web UI                                                          |
| `campusops-backend`  | 6000       | Express + TypeScript + Socket.IO + BullMQ | REST API and WebSocket server                                        |
| `campusops-db`       | (internal) | MySQL 8                                   | Relational datastore; not exposed to host                            |
| `campusops-redis`    | (internal) | Redis 7                                   | BullMQ queues, rate limiting, idempotency cache; not exposed to host |

**Access URLs:**

| Service      | URL                            |
| ------------ | ------------------------------ |
| Web console  | `http://localhost`             |
| Backend API  | `http://localhost:6000/api`    |
| Health check | `http://localhost:6000/health` |

---

## Seeded Accounts

Default usernames are fixed, but passwords must be provided via environment variables:

| Role                   | Username      | Password source             |
| ---------------------- | ------------- | --------------------------- |
| Administrator          | `admin`       | `SEED_ADMIN_PASSWORD`       |
| Operations Manager     | `ops_manager` | `SEED_OPS_MANAGER_PASSWORD` |
| Classroom Supervisor   | `supervisor`  | `SEED_SUPERVISOR_PASSWORD`  |
| Customer Service Agent | `cs_agent`    | `SEED_CS_AGENT_PASSWORD`    |
| Auditor                | `auditor`     | `SEED_AUDITOR_PASSWORD`     |

If a seed password is unset or still set to `CHANGE_ME_*`, that account is skipped during seeding.

---

## Verification Checklist

After `docker compose up`, confirm the system is running:

1. **Container health** — all four containers show `healthy`:

   ```bash
   docker compose ps
   ```

2. **Backend health endpoint** — returns `{"status":"ok"}`:

   ```bash
   curl http://localhost:6000/health
   ```

3. **Frontend loads** — open `http://localhost` in a browser and confirm the login page appears.

4. **Login** — sign in with the admin credentials configured through `SEED_ADMIN_PASSWORD`.

5. **Background jobs running** — navigate to the Jobs screen. You should see repeatable jobs registered (escalation-checker, heartbeat-checker, metric-alert-check, etc.).

6. **Backup check** — trigger a manual backup and verify it completes:
   ```bash
    curl -X POST http://localhost:6000/api/backups \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json"
   ```
   Then verify the backup record:
   ```bash
    curl -X POST http://localhost:6000/api/backups/<id>/verify \
     -H "Authorization: Bearer <token>"
   ```
   Confirm `"passed": true` in the response.

---

## Running Tests

```bash
cd repo
bash run_tests.sh
```

This script runs all test suites sequentially and outputs a pass/fail summary:

- **Frontend unit tests** — Vitest (`frontend/unit_tests`)
- **Backend unit tests** — Vitest (service layer)
- **API functional tests** — Jest + Supertest (full HTTP cycle against a test database)

Test suites run through Docker Compose test-runner services (`frontend-test-runner`, `backend-unit-test-runner`, `api-test-runner`).

All dependency installation and test execution happen inside Docker containers. No host-level `node_modules` are required.

See `docs/test-plan.md` for the full test inventory.

---

## File Upload Rules

Evidence images attached to after-sales tickets must meet the following rules:

| Rule              | Value                                                                              |
| ----------------- | ---------------------------------------------------------------------------------- |
| Accepted formats  | JPEG, PNG only (validated by magic bytes)                                          |
| Maximum file size | 10 MB                                                                              |
| Compression       | Resized to max 1920px, quality 80 (sharp)                                          |
| Deduplication     | aHash (8x8 grayscale); Hamming distance <= 5 blocks duplicate upload with HTTP 409 |
| Storage location  | Docker volume at `/data/storage` inside the backend container                      |
| File naming       | `evidence_{ticketId}_{timestamp}.jpg`                                              |

---

## LAN / TLS Notes

This system is designed for **HTTP-only operation on a local network**. There is no TLS, no HTTPS, and no certificate management built in.

- The frontend listens on host port 80 and the backend API listens on host port 6000.
- All traffic between containers is on the internal `campusops-net` Docker bridge — never exposed to the internet.
- This configuration is appropriate for air-gapped campus networks where the host machine is not publicly reachable.

---

## Backup and Restore

Backups are JSON manifests written to the `/backups` Docker volume (mapped from `backups-data`). Each manifest records row counts per table and is named `backup_YYYY-MM-DD_HHmmss.json`.

- **Scheduled backup:** daily at 02:00 UTC (BullMQ `campusops:backup` queue)
- **Retention:** 14 days (older manifests deleted automatically)
- **Log retention:** 30 days (daily `YYYY-MM-DD.log` files)

For full restore procedures, see `docs/restore.md`. For backup operations reference, see `docs/backup.md`.

---

## Stopping

```bash
docker compose down
```

To remove all volumes (full reset — destroys all data):

```bash
docker compose down -v
```

---

## Known Operational Assumptions

- **LAN only** — no feature requires internet access at runtime. All carrier sync is simulated internally.
- **Secrets must be pre-populated** — the stack will not start if any file in `secrets/` is missing.
- **Seed account passwords must be configured** — placeholder `SEED_*_PASSWORD` values do not create login accounts.
- **Single host** — no clustering or horizontal scaling is supported. All containers run on one machine.
- **No email or SMS** — notifications are delivered exclusively through the in-app WebSocket alert system.
- **Timezone** — the backend defaults to `America/New_York` (`TZ` environment variable in `docker-compose.yml`). Adjust before first boot if needed.
- **Frontend unit tests** — included in `bash run_tests.sh` and executed in an isolated Node container.

---

## Documentation Index

| Document             | Location                       |
| -------------------- | ------------------------------ |
| Architecture Design  | `docs/design.md`               |
| API Specification    | `docs/api-spec.md`             |
| Test Plan            | `docs/test-plan.md`            |
| Deployment Guide     | `docs/deployment.md`           |
| Operations Runbook   | `docs/runbook.md`              |
| Backup Runbook       | `docs/backup.md`               |
| Restore Runbook      | `docs/restore.md`              |
| JWT Rotation         | `docs/cert-rotation.md`        |
| Retention Cleanup    | `docs/retention-cleanup.md`    |
| Troubleshooting      | `docs/troubleshooting.md`      |
| Acceptance Checklist | `docs/acceptance-checklist.md` |
