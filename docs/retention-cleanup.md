# Retention Cleanup Runbook

## Overview

CampusOps automatically cleans up two categories of aging data:

| Data type    | Retention period | Cleanup trigger                        |
|--------------|------------------|----------------------------------------|
| Log files    | 30 days          | BullMQ worker `campusops:log-retention` |
| Backup files | 14 days (default)| BullMQ worker `campusops:backup`       |

---

## Log retention (30 days)

### What is cleaned

Winston writes one log file per day to the directory configured in
`config.logs.path` (e.g., `/var/campusops/logs`). Files are named
`YYYY-MM-DD.log`.

The retention worker deletes all `YYYY-MM-DD.log` files whose date is more than
30 days before today.

### BullMQ worker

Queue name: `campusops:log-retention`

Worker file: `backend/src/jobs/workers/log-retention.worker.ts`

The worker calls `cleanOldLogs()` from `log.service.ts`, which:
1. Reads the `config.logs.path` directory.
2. Filters files matching `YYYY-MM-DD.log` whose date is before the cutoff.
3. Deletes each matching file via `fs.unlinkSync`.
4. Returns the count of deleted files.

### Changing log retention period

The 30-day period is hardcoded in `getLogRetentionCutoff()` in
`log.service.ts`. To change it, update that function and redeploy.

### Running log cleanup manually

Via the BullMQ job (add a one-off job to the queue), or directly in code:

```typescript
import { cleanOldLogs } from './modules/observability/log.service';
const deleted = await cleanOldLogs();
console.log(`Deleted ${deleted} log files`);
```

---

## Backup retention (14 days)

### What is cleaned

After each daily backup, the backup worker calls `enforceRetention()`, which:
1. Queries `BackupRecord` rows where `startedAt < (now - retentionDays)`.
2. Deletes the corresponding file from disk (if it exists).
3. Deletes the `BackupRecord` row from the database.

Default retention: **14 days**. Override via `config.backup.retentionDays` or
the `BACKUP_RETENTION_DAYS` environment variable.

### BullMQ worker

Queue name: `campusops:backup`

Worker file: `backend/src/jobs/workers/backup.worker.ts`

The worker calls both `runBackup('system')` and `enforceRetention()` in sequence.

### Running backup retention manually

```typescript
import { enforceRetention } from './modules/observability/backup.service';
const { deleted } = await enforceRetention(); // uses config default
console.log(`Deleted ${deleted} backup records and files`);
```

---

## Verifying cleanup ran

### Log cleanup

Check worker job results in BullMQ dashboard or Redis:

```bash
redis-cli LRANGE "bull:campusops:log-retention:completed" 0 9
```

Or check application logs for:

```
{"msg":"Log retention cleanup completed","deletedFiles":3}
```

### Backup cleanup

Check application logs for:

```
{"msg":"Backup retention enforced","deleted":2,"retentionDays":14}
```

Or query the database:

```sql
SELECT COUNT(*) FROM BackupRecord WHERE startedAt < DATE_SUB(NOW(), INTERVAL 14 DAY);
-- Should be 0 after cleanup runs
```

---

## Scheduler setup

Both workers are triggered by BullMQ repeatable jobs. Ensure the scheduler is
configured in `jobs/schedulers/` with appropriate cron expressions, for example:

```typescript
// Daily backup at 03:00 UTC
await backupQueue.add('daily-backup', {}, { repeat: { cron: '0 3 * * *' } });

// Log cleanup at 02:00 UTC daily
await logRetentionQueue.add('daily-log-cleanup', {}, { repeat: { cron: '0 2 * * *' } });
```

---

## Disk space monitoring

If disk usage is a concern, monitor the log and backup directories:

```bash
du -sh /var/campusops/logs/
du -sh /var/campusops/backups/
```

Alert thresholds for disk utilization can be configured as `AlertThreshold`
records via the `/api/thresholds` endpoint.
