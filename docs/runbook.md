# Operations Runbook — CampusOps Fulfillment & Operations Platform

This document is the top-level operations reference. It provides a first-hour incident response guide and links to each domain-specific runbook.

---

## Sub-Document Index

| Document                                       | Scope                                                                                           |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [backup.md](./backup.md)                       | Triggering backups, checking backup status, verifying manifests, retention                      |
| [restore.md](./restore.md)                     | Locating backup manifests, verifying before restore, full DB restore, post-restore verification |
| [cert-rotation.md](./cert-rotation.md)         | JWT secret rotation procedure, when to rotate, impact on active sessions                        |
| [retention-cleanup.md](./retention-cleanup.md) | Log and backup retention policies, manual cleanup, scheduler setup                              |
| [troubleshooting.md](./troubleshooting.md)     | Redis down, DB connection errors, failed backups, high CPU alert, stalled workers               |

---

## System Quick Reference

**Start the stack:**

```bash
cd repo && docker compose up -d
```

**Health check:**

```bash
curl -k https://localhost/health
```

**View live logs:**

```bash
docker compose logs -f backend
```

**Container status:**

```bash
docker compose ps
```

**Expected state:** Five services (`reverse-proxy`, `frontend`, `backend`, `db`, `redis`) all showing `healthy` or `running`.

---

## First Hour Incident Response

Use this checklist when the system appears degraded or unavailable. Work top-to-bottom. Stop at the step that reveals the root cause.

### Step 1 — Check container health

```bash
docker compose ps
```

- All five services should show `Up` and `healthy`.
- If a container shows `Exit` or `unhealthy`, restart it:
  ```bash
  docker compose restart <service-name>
  ```
- If the backend is restarting in a loop, read the last 50 log lines:
  ```bash
  docker compose logs --tail=50 backend
  ```

### Step 2 — Check the health endpoint

```bash
curl -k https://localhost/health
```

Expected: `{ "status": "ok", "db": "connected", "redis": "connected" }`

If the response shows `"db": "error"`, go to the **Database** section of [troubleshooting.md](./troubleshooting.md).

If the response shows `"redis": "error"`, go to the **Redis** section of [troubleshooting.md](./troubleshooting.md).

### Step 3 — Check for recent errors in structured logs

Via API (requires admin token):

```bash
curl -k "https://localhost/api/logs?level=error&limit=50" \
  -H "Authorization: Bearer <admin-token>"
```

Or via Docker directly:

```bash
docker compose logs --tail=100 backend | grep '"level":"error"'
```

### Step 4 — Check active alerts

Log in to the web console at `https://localhost`. Any active threshold-breach alerts will be shown as banners on the dashboard.

Or via API:

```bash
curl -k "https://localhost/api/alerts?acknowledged=false" \
  -H "Authorization: Bearer <admin-token>"
```

Common alerts and their meaning:

| Alert                           | Likely cause                                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| `cpu_utilization_percent` high  | Runaway worker or heavy query — see [troubleshooting.md](./troubleshooting.md) section 4 |
| `memory_used_mb` high           | Memory leak or over-loaded job queue — restart backend                                   |
| `open_after_sales_tickets` high | Ticket backlog — operational, not a system error                                         |
| `open_parking_alerts` high      | Alert backlog — escalation worker may be failing                                         |

### Step 5 — Check background job health

```bash
curl -k "https://localhost/api/jobs?status=failed&limit=20" \
  -H "Authorization: Bearer <admin-token>"
```

For stalled workers, see [troubleshooting.md](./troubleshooting.md) section 5.

To retry a failed job:

```bash
curl -k -X POST "https://localhost/api/jobs/<jobId>/retry" \
  -H "Authorization: Bearer <admin-token>" \
  -H "X-Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json"
```

### Step 6 — Check backup status

If the issue involves data integrity, verify the last successful backup:

```bash
curl -k "https://localhost/api/backups?status=completed&limit=5" \
  -H "Authorization: Bearer <admin-token>"
```

If no recent backup exists, trigger one immediately:

```bash
curl -k -X POST "https://localhost/api/backups" \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json"
```

See [backup.md](./backup.md) and [restore.md](./restore.md) for recovery procedures.

### Step 7 — Restart the full stack

If no specific cause is found, perform a clean restart:

```bash
docker compose down
docker compose up -d
docker compose logs -f backend
```

Wait for `CampusOps API listening on port 3000` to confirm successful startup.

### Step 8 — Escalation

If the system remains unavailable after working through steps 1–7:

1. Capture full logs: `docker compose logs > campusops-logs-$(date +%Y%m%d-%H%M).txt`
2. Capture container state: `docker compose ps >> campusops-logs-$(date +%Y%m%d-%H%M).txt`
3. Escalate to the next tier with the captured log file.

---

## Routine Maintenance Checklist

**Daily (automated — verify these ran):**

- [ ] Backup job completed (`GET /api/backups?status=completed&limit=1`)
- [ ] No failed jobs in the last 24 hours (`GET /api/jobs?status=failed`)
- [ ] No unacknowledged high-severity alerts (`GET /api/alerts?acknowledged=false`)

**Weekly:**

- [ ] Review disk usage on the host (logs, backups, storage volumes)
- [ ] Review audit log for unexpected administrative actions (`GET /api/admin/audit`)
- [ ] Confirm backup manifests verify cleanly for the last 7 days

**Monthly:**

- [ ] Rotate JWT secret if policy requires — see [cert-rotation.md](./cert-rotation.md)
- [ ] Review and update `AlertThreshold` records if metric baselines have shifted
- [ ] Verify at least one backup can be restored — follow steps in [restore.md](./restore.md)

---

## Key API Endpoints for Operations

| Action            | Command                              |
| ----------------- | ------------------------------------ |
| Health check      | `GET /health`                        |
| Trigger backup    | `POST /api/backups`                  |
| Verify backup     | `POST /api/backups/:id/verify`       |
| List failed jobs  | `GET /api/jobs?status=failed`        |
| Retry a job       | `POST /api/jobs/:id/retry`           |
| List open alerts  | `GET /api/alerts?acknowledged=false` |
| Acknowledge alert | `PATCH /api/alerts/:id/acknowledge`  |
| Search logs       | `GET /api/logs?level=error&limit=50` |
| System metrics    | `GET /api/metrics`                   |
