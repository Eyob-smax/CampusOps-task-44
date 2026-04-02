# Runbook: Troubleshooting

## Quick Diagnostics

```
GET /health           # Infrastructure health (no auth)
GET /api/metrics      # Latest system metrics (requires auth)
GET /api/logs?severity=error&limit=20  # Recent error logs (requires auth)
```

---

## BullMQ Jobs Not Running

**Symptoms:** Background tasks (escalation checks, heartbeats, carrier sync) stop firing.

**Check:**
1. Redis connectivity: `redis-cli -u $REDIS_URL ping` → must return `PONG`.
2. Worker registration: look for `msg: "Background jobs registered"` in startup logs.
3. Stalled jobs: connect to BullMQ and check for jobs in `stalled` state.

**Fix:**
```bash
# Restart the backend (re-registers all workers and repeatable jobs)
docker compose restart backend
```

If jobs were stalled, they will be retried automatically on worker restart.

---

## Threshold Alerts Not Firing

**Symptoms:** Metric values exceed thresholds but no `AlertHistory` rows are created.

**Check:**
1. `AlertThreshold.isActive = true` for the relevant rule:
   ```
   GET /api/thresholds
   ```
2. Metrics are being collected: check for recent `MetricsSnapshot` rows:
   ```
   GET /api/metrics
   ```
3. `campusops:metric-alert-check` job is running — look for `msg: "Metric alert check completed"` in logs.

**Fix:** If the metric collection job has stalled, restart the backend.

---

## Backup Job Failing

**Symptoms:** `BackupRecord.status = 'failed'` or no new backup records.

**Check:**
1. `BACKUP_PATH` is writable:
   ```bash
   ls -la $BACKUP_PATH
   touch $BACKUP_PATH/test.tmp && rm $BACKUP_PATH/test.tmp
   ```
2. Disk space:
   ```bash
   df -h $BACKUP_PATH
   ```
3. Error in logs: `msg: "Backup failed"` — check `error` field.

**Fix:** Resolve the file system issue, then trigger a manual backup:
```
POST /api/backups
Authorization: Bearer <admin-token>
```

---

## Evidence Upload Failing

**Symptoms:** `POST /api/after-sales/:id/evidence/image` returns `422`.

**Possible error codes:**

| Code                   | Meaning                                          | Fix                             |
|------------------------|--------------------------------------------------|---------------------------------|
| `INVALID_MIME_TYPE`    | File is not JPEG or PNG                          | Re-upload with correct format   |
| `INVALID_FILE_CONTENT` | Magic bytes don't match declared MIME type       | File may be corrupt or renamed  |
| `FILE_TOO_LARGE`       | File exceeds 10 MB                               | Compress before uploading       |
| `DUPLICATE_EVIDENCE`   | Perceptual hash ≤5 bits from an existing image  | Image is a near-duplicate       |
| `TICKET_NOT_FOUND`     | Ticket ID does not exist                         | Verify the ticket ID            |

---

## Compensation Approval Failing with 403

**Symptoms:** `PATCH /api/after-sales/:id/compensations/:cid/approve` returns `403 APPROVAL_LIMIT_EXCEEDED`.

**Explanation:** The compensation amount exceeds the approver's tier limit:

| Permission Level | Max Amount |
|-----------------|-----------|
| `compensation:approve-limited` | $25 |
| `compensation:approve-full`    | $50 |
| `compensation:approve-override`| Unlimited |

**Fix:** Escalate to a user with a higher permission level, or reduce the compensation amount.

---

## Carrier Sync Returning Errors

**Symptoms:** `POST /api/shipments/sync/:carrierId` returns `errors > 0`.

**Check:**
1. Carrier ID exists: `GET /api/carriers/:id`.
2. Carrier is active (`isActive = true`).
3. Parcels for this carrier are not already in terminal state (`delivered`, `returned`).
4. Logs: `msg: "Failed to update parcel during sync"` — check `parcelId` and `err`.

The carrier sync connector is **internal only** (no network calls). Errors are Prisma-level
database errors — check DB connectivity and constraints.

---

## Log Search Returns No Results

**Symptoms:** `GET /api/logs` returns empty array.

**Check:**
1. `LOG_PATH` is configured and the directory exists:
   ```bash
   ls $LOG_PATH
   ```
2. Log files follow the naming pattern `YYYY-MM-DD.log`.
3. Date range filters are not excluding all files — try without `from`/`to` params.
4. Log files are valid JSON-per-line (no malformed entries prevent parsing).

---

## Classroom Heartbeat Alerts

**Symptoms:** Classroom sessions showing stale heartbeat errors.

**Check:** `config.classroom.heartbeatStaleSeconds` (default: 90s). Sessions not sending heartbeat
within this window are flagged. Check if the frontend heartbeat interval matches.

**Fix:** Restart the frontend for affected classrooms, or manually close stale sessions:
```
PATCH /api/classrooms/sessions/:id
{ "status": "closed" }
```

---

## Database Connection Issues

**Symptoms:** All API endpoints return 500, logs show Prisma connection errors.

**Check:**
```bash
mysql -h $DB_HOST -u campusops -p -e "SELECT 1;"
```

**Fix:**
1. Verify `DATABASE_URL` is correctly set.
2. Check MySQL container/service is running: `docker compose ps db`.
3. Check connection pool exhaustion — reduce concurrent requests or increase pool size via
   `DATABASE_POOL_MAX` env var (default: 10).
