# Deployment Guide — CampusOps Fulfillment & Operations Platform

This document is the single source of truth for deployment topology, exposed ports, and startup/runtime verification.

---

## 1. Prerequisites

| Requirement      | Minimum version                    | Notes                                                          |
| ---------------- | ---------------------------------- | -------------------------------------------------------------- |
| Docker Engine    | 24+                                | `docker --version`                                             |
| Docker Compose   | v2+ (plugin, not standalone)       | `docker compose version`                                       |
| Operating system | Linux, macOS, or Windows with WSL2 | Docker Desktop satisfies all requirements on macOS and Windows |
| RAM              | 4 GB available for containers      | MySQL and the Node.js backend are the largest consumers        |
| Disk             | 10 GB free                         | Images, volumes (database, storage, logs, backups)             |

No other host-level software is required. Node.js, MySQL, and Redis are all provided by the Docker images.

---

## 2. First-Time Setup

### 2.1 Clone / copy the repository

The application root is the `repo/` directory. All commands in this guide assume you are in `repo/`.

### 2.2 Secrets

The repository ships template secret files under `repo/secrets/*.example`.
Create runtime secret files under `repo/runtime-secrets/` before startup:

```bash
mkdir -p repo/runtime-secrets
cp repo/secrets/db_password.txt.example repo/runtime-secrets/db_password.txt
cp repo/secrets/db_root_password.txt.example repo/runtime-secrets/db_root_password.txt
cp repo/secrets/jwt_secret.txt.example repo/runtime-secrets/jwt_secret.txt
cp repo/secrets/encryption_key.txt.example repo/runtime-secrets/encryption_key.txt
```

Rotate all copied placeholder values before any real deployment.

### 2.3 Start the stack

```bash
docker compose up --build
```

Or run in the background:

```bash
docker compose up -d
```

On first boot:

1. MySQL initializes the `campusops` database and runs `backend/database/init/01-charset.sql`.
2. The backend waits for MySQL to be healthy, then applies Prisma migrations with `prisma migrate deploy` when migration files exist.
3. If no migrations are present, non-production startup falls back to `prisma db push` (production startup refuses this fallback).
4. The seed script (`database/seeders/seed.ts`, compiled to `dist/`) creates seeded user accounts only when non-placeholder `SEED_*_PASSWORD` values are configured.
5. BullMQ repeatable jobs are registered.
6. The frontend builds the Vue SPA and serves static assets on an internal container port.
7. `reverse-proxy` terminates TLS on `:443`, redirects `:80` to HTTPS, and proxies `/`, `/api/*`, `/health`, and `/socket.io/*`.

First-boot time is typically 60–120 seconds depending on hardware. Monitor with:

```bash
docker compose logs -f backend
```

Look for: `CampusOps API listening on port 3000`

---

## 3. Startup Procedure

After first boot, subsequent starts are faster (images are cached, database is seeded):

```bash
docker compose up -d
```

Check container health:

```bash
docker compose ps
```

All five containers should show `healthy` or `running`.

Expected services:
- `db`
- `redis`
- `backend`
- `frontend`
- `reverse-proxy`

---

## 4. LAN Deployment Notes

CampusOps is designed for **air-gapped local network operation**:

- The system is **TLS-first** for LAN traffic.
- Host port `80` is redirect-only (`http` -> `https`).
- Host port `443` is the only application ingress for browser/API/socket traffic.
- `reverse-proxy` uses a self-signed certificate by default for disconnected deployments.
- All container-to-container traffic is on the internal `campusops-net` Docker bridge — never routed over the LAN.
- No feature requires internet access at runtime.

**Accessing from other LAN machines:**

Replace `localhost` with the host machine's LAN IP address:

```
https://192.168.1.50        # Web console
https://192.168.1.50/api    # API
```

---

## 5. Environment Variable Reference

Backend defaults are split between `backend/Dockerfile` and `docker-compose.yml`. Override at compose runtime only when required.

| Variable                    | Default                         | Description                                         |
| --------------------------- | ------------------------------- | --------------------------------------------------- |
| `NODE_ENV`                  | `production`                    | Application mode                                    |
| `PORT`                      | `3000`                          | Port the backend Express server listens on          |
| `DB_HOST`                   | `db`                            | MySQL container hostname                            |
| `DB_PORT`                   | `3306`                          | MySQL port                                          |
| `DB_NAME`                   | `campusops`                     | Database name                                       |
| `DB_USER`                   | `campusops`                     | Database user                                       |
| `REDIS_URL`                 | `redis://redis:6379`            | Redis connection URL                                |
| `ENFORCE_TLS`               | `true` in production            | Reject non-HTTPS requests (except `/health`)        |
| `CORS_ALLOWED_ORIGINS`      | `https://localhost,https://127.0.0.1,https://localhost:443,https://127.0.0.1:443` | Comma-separated CORS allowlist |
| `CORS_ALLOW_REQUESTS_WITHOUT_ORIGIN` | `true`                  | Allow non-browser clients with no `Origin` header   |
| `AUTH_REDIS_FAIL_OPEN`      | `false` in production           | Auth revocation lookup behavior on Redis failure    |
| `IDEMPOTENCY_REDIS_FAIL_OPEN` | `false` in production         | Idempotency behavior on Redis failure               |
| `CARRIER_SYNC_MODE`         | `connector` in production       | Carrier sync mode: `connector` or `simulation`      |
| `CARRIER_SYNC_TIMEOUT_MS`   | `5000`                          | Connector request timeout in milliseconds           |
| `CARRIER_SYNC_ALLOW_SIMULATION_FALLBACK` | `false` in production | Fallback to simulation when connector errors occur  |
| `STORAGE_PATH`              | `/data/storage`                 | Evidence file storage path inside the container     |
| `LOG_PATH`                  | `/logs`                         | Log file directory inside the container             |
| `BACKUP_PATH`               | `/backups`                      | Backup manifest directory inside the container      |
| `BACKUP_RETENTION_DAYS`     | `14`                            | Backup retention window in days                     |
| `BACKUP_SCHEDULE_CRON`      | `0 2 * * *`                     | Daily backup schedule cron expression (UTC)         |
| `TZ`                        | `America/New_York`              | Timezone for cron job scheduling and log timestamps |
| `SEED_ADMIN_PASSWORD`       | Placeholder rejected outside test mode | Seeded administrator password               |
| `SEED_OPS_MANAGER_PASSWORD` | Placeholder rejected outside test mode | Seeded operations manager password          |
| `SEED_SUPERVISOR_PASSWORD`  | Placeholder rejected outside test mode | Seeded classroom supervisor password        |
| `SEED_CS_AGENT_PASSWORD`    | Placeholder rejected outside test mode | Seeded customer service agent password      |
| `SEED_AUDITOR_PASSWORD`     | Placeholder rejected outside test mode | Seeded auditor password                     |

Secrets (encryption key, DB passwords, JWT secret) are injected via Docker secrets at `/run/secrets/` — not environment variables.
Outside test mode, backend startup fails closed if any secret or seeded password still uses placeholder/insecure default values.

---

## 6. Volume Management

| Volume name    | Mount path (container)    | Purpose                      |
| -------------- | ------------------------- | ---------------------------- |
| `db-data`      | `/var/lib/mysql` (MySQL)  | Relational database files    |
| `redis-data`   | `/data` (Redis)           | Redis AOF/RDB persistence    |
| `storage-data` | `/data/storage` (backend) | Evidence image files         |
| `logs-data`    | `/logs` (backend)         | Daily `YYYY-MM-DD.log` files |
| `backups-data` | `/backups` (backend)      | Backup manifest JSON files   |
| `tls-certs-data` | `/etc/nginx/certs` (reverse-proxy) | TLS certificate/key files |

**Inspecting volume location on host:**

```bash
docker volume inspect campusops-backup-data
# Shows the "Mountpoint" path on the host filesystem
```

**Backing up volumes to host:**

```bash
# Copy backup manifests to host
docker cp campusops-backend:/backups ./host-backup-dir/

# Copy evidence files to host
docker cp campusops-backend:/data/storage ./host-storage-backup/
```

---

## 7. Backup Configuration

The backup system runs automatically. Key configuration points:

| Setting          | Value                      | How to change                                                 |
| ---------------- | -------------------------- | ------------------------------------------------------------- |
| Backup schedule  | Daily 02:00 UTC            | Set `BACKUP_SCHEDULE_CRON` or update `config.backup.scheduleCron` |
| Retention period | 14 days                    | Set `BACKUP_RETENTION_DAYS` env var in `docker-compose.yml`   |
| Backup path      | `/backups` (Docker volume) | Set `BACKUP_PATH` env var                                     |
| Log retention    | 30 days                    | Hardcoded in `log.service.ts`; requires code change to modify |

To trigger a manual backup immediately:

```bash
curl -k -X POST https://localhost/api/backups \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json"
```

See `docs/backup.md` for the full backup operations reference.

---

## 8. Scaling Considerations

**Current architecture: single-host only.**

- All services run on one Docker host. There is no clustering, no load balancing, and no shared file system between multiple instances.
- Horizontal scaling is not supported in the current implementation because:
  - The `storage-data` volume is a local Docker volume (not shared NFS/S3).
  - BullMQ workers run inside the single backend container.
  - Socket.IO does not use a Redis adapter for multi-node fan-out.
- For increased throughput on a single host, increase Docker resource limits (CPU, memory) for the `backend` service in `docker-compose.yml`.
- If the MySQL container becomes a bottleneck, consider moving to an external MySQL 8 instance and updating `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` accordingly.

---

## 9. Upgrading Procedure

1. **Pull or copy the new code** to the host.

2. **Review any environment variable or secret changes** noted in the release notes.

3. **Back up the current state:**

   ```bash
   curl -k -X POST https://localhost/api/backups \
     -H "Authorization: Bearer <admin-token>"
   ```

4. **Stop the running stack:**

   ```bash
   docker compose down
   ```

5. **Rebuild images:**

   ```bash
   docker compose build --no-cache
   ```

6. **Start the updated stack:**

   ```bash
   docker compose up -d
   ```

7. **Verify schema setup ran:** confirm migration deployment (or non-production fallback) from backend logs:

   ```bash
   docker compose logs backend | grep -i migration
   ```

8. **Run the test suite** to confirm no regressions:

   ```bash
   ./run_tests.sh
   ```

   PowerShell fallback (no `sh` required):

   ```powershell
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

9. **Verify the health endpoint:**
   ```bash
   curl -k https://localhost/health
   ```

---

## 10. Stopping and Resetting

**Stop (preserves data):**

```bash
docker compose down
```

**Full reset (destroys all data — irreversible):**

```bash
docker compose down -v
```

This removes all Docker volumes including the database, storage, logs, and backups.
