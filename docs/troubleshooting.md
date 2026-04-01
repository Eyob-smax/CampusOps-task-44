# Troubleshooting Runbook

## 1. Redis is down

### Symptoms
- BullMQ workers fail to start or process jobs
- Socket.IO events not being emitted
- API returns 500 errors on queue-dependent endpoints
- Log line: `Error: connect ECONNREFUSED 127.0.0.1:6379`

### Diagnosis

```bash
redis-cli ping
# Expected: PONG
# If refused: Redis is not running
```

Check Redis process:

```bash
systemctl status redis
# or
docker ps | grep redis
```

### Resolution

1. Restart Redis:

```bash
systemctl restart redis
# or
docker compose restart redis
```

2. Restart the CampusOps backend (BullMQ will reconnect automatically, but
   restarting ensures clean state):

```bash
pm2 restart campusops-api
```

3. Check for any stalled jobs after reconnect:

```bash
redis-cli LLEN "bull:campusops:backup:stalled"
redis-cli LLEN "bull:campusops:metric-alert-check:stalled"
```

---

## 2. Database connection errors

### Symptoms
- API returns 500 with `PrismaClientInitializationError` or `Can't reach database server`
- Workers fail immediately on any Prisma call
- Log line: `Error: P1001: Can't reach database server`

### Diagnosis

```bash
# Test MySQL connectivity
mysql -h <DB_HOST> -u <DB_USER> -p<DB_PASS> -e "SELECT 1"

# Check Prisma DATABASE_URL
echo $DATABASE_URL
```

### Resolution

1. Verify MySQL is running:

```bash
systemctl status mysql
# or
docker ps | grep mysql
```

2. Check `DATABASE_URL` in `.env` — confirm host, port, credentials, and
   database name are correct.

3. Check connection pool limits — if MySQL `max_connections` is exhausted:

```sql
SHOW STATUS LIKE 'Threads_connected';
SHOW VARIABLES LIKE 'max_connections';
```

4. Restart the database if necessary:

```bash
systemctl restart mysql
```

5. Restart the backend after DB recovery:

```bash
pm2 restart campusops-api
```

---

## 3. Failed backups

### Symptoms
- `BackupRecord.status = 'failed'`
- `BackupRecord.errorMsg` is populated

### Diagnosis

```sql
SELECT id, fileName, status, errorMsg, startedAt
FROM BackupRecord
WHERE status = 'failed'
ORDER BY startedAt DESC
LIMIT 10;
```

Common error messages and causes:

| Error | Cause |
|-------|-------|
| `ENOENT: no such file or directory` | Backup directory does not exist or is not writable |
| `EACCES: permission denied` | Process user does not have write permission |
| `ENOSPC: no space left on device` | Disk full |
| Prisma error | Database unreachable during row count collection |

### Resolution

1. **Directory missing or not writable:**

```bash
mkdir -p /var/campusops/backups
chown campusops:campusops /var/campusops/backups
chmod 750 /var/campusops/backups
```

2. **Disk full:**

```bash
df -h /var/campusops/backups
# Free space by removing old files or expanding the volume
```

3. **Trigger a new backup after fixing the root cause:**

```
POST /api/backups
```

---

## 4. High CPU alert

### Symptoms
- `AlertHistory` record created with `metricName: "cpu_utilization_percent"`
- Socket event `alert:threshold-breach` emitted to `/alerts`

### Diagnosis

Identify what is consuming CPU:

```bash
top -b -n 1 | head -20
ps aux --sort=-%cpu | head -10
```

Check active jobs:

```
GET /api/metrics
# Look at active_jobs value
```

Check BullMQ queue depths:

```bash
redis-cli LLEN "bull:campusops:backup:active"
redis-cli LLEN "bull:campusops:metric-alert-check:active"
```

### Resolution

1. If a runaway worker is consuming CPU, restart it:

```bash
pm2 restart campusops-workers
```

2. If a database query is causing load, check slow query log:

```sql
SHOW PROCESSLIST;
```

3. If CPU is consistently high, consider scaling horizontally (add more API
   instances behind the load balancer) or optimizing heavy queries.

4. Acknowledge the alert after investigation:

```
PATCH /api/alerts/:alertHistoryId/acknowledge
```

---

## 5. Worker stalled

### Symptoms
- Jobs stuck in `active` state in BullMQ for longer than the `lockDuration`
- Log line: `Job stalled` in BullMQ internals
- `JobRecord.status` stuck at `active`

### Diagnosis

```bash
# Check stalled jobs count
redis-cli LLEN "bull:campusops:backup:stalled"
redis-cli LLEN "bull:campusops:metric-alert-check:stalled"
redis-cli LLEN "bull:campusops:log-retention:stalled"
```

Check which worker processes are running:

```bash
pm2 list
```

### Resolution

1. Stalled jobs are automatically retried by BullMQ when a new worker starts.
   Restart the worker process:

```bash
pm2 restart campusops-workers
```

2. If jobs continue to stall, increase the `lockDuration` in the Worker
   options for long-running jobs (e.g., the backup worker):

```typescript
new Worker('campusops:backup', handler, {
  connection: getRedisClient(),
  lockDuration: 120000, // 2 minutes
});
```

3. Check for uncaught promise rejections that may be hanging the worker event
   loop. Review logs:

```bash
pm2 logs campusops-workers --lines 100
```

4. If a specific job is permanently stuck, remove it manually:

```bash
redis-cli DEL "bull:campusops:backup:<jobId>"
```

---

## General health check

```
GET /api/health
```

This endpoint returns database connectivity, Redis connectivity, and uptime.
It should be the first check in any incident.
