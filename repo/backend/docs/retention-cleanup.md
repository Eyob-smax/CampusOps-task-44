# Runbook: Retention Cleanup

## Overview

Two independent retention policies are enforced automatically:

| Data                | Retention | Job                            | Schedule       |
|---------------------|-----------|--------------------------------|----------------|
| Log files           | 30 days   | `campusops:log-retention`      | Daily 03:00 UTC |
| Backup manifests    | 14 days   | `campusops:log-retention`      | Daily 03:00 UTC |

Both are executed in `backend/src/jobs/workers/log-retention.worker.ts`.

---

## Log File Retention

Log files follow the naming convention `YYYY-MM-DD.log` stored under `LOG_PATH` (default: `./logs`).

**What is deleted:**
- Files matching `YYYY-MM-DD.log` where the date is older than 30 days from midnight today.
- Files that cannot be parsed as a date are skipped.

**Implementation:** `cleanOldLogs()` in `observability/log.service.ts`.

**Manual execution:**

```ts
import { cleanOldLogs } from './src/modules/observability/log.service';
const deleted = await cleanOldLogs();
console.log(`Deleted ${deleted} log files`);
```

**Tuning retention period:**

The 30-day window is hard-coded in `getLogRetentionCutoff()`. To change it, edit that function.
There is no environment variable override for log retention at this time.

---

## Backup Manifest Retention

Backup manifest JSON files and their `BackupRecord` database rows are deleted together.

**What is deleted:**
- `BackupRecord` rows where `startedAt < (today - retentionDays)`.
- The corresponding manifest file on disk (if it still exists).

**Default retention:** 14 days. Configurable via `config.backup.retentionDays`.

**Implementation:** `enforceRetention()` in `observability/backup.service.ts`.

**Manual execution:**

```ts
import { enforceRetention } from './src/modules/observability/backup.service';
const { deleted } = await enforceRetention(14);
console.log(`Deleted ${deleted} backup records`);
```

---

## Monitoring

On each cleanup run, the worker logs:

```
{ msg: "Log retention cleanup completed", logFilesDeleted: N, backupsDeleted: M }
```

Search for this in the application logs to confirm cleanup is running.

If `logFilesDeleted` or `backupsDeleted` is unexpectedly 0 when you expect deletions:
1. Check `LOG_PATH` and `BACKUP_PATH` are correctly set and the files are present.
2. Check the worker is running: look for `msg: "Log retention worker registered"` at startup.
3. Check BullMQ `campusops:log-retention` queue has no stalled jobs via the Bull dashboard.

---

## Emergency Manual Cleanup

If the job is not running, clean up manually:

```bash
# Log files older than 30 days
find $LOG_PATH -name '*.log' -mtime +30 -delete

# Backup manifests older than 14 days
find $BACKUP_PATH -name 'backup_*.json' -mtime +14 -delete
```

Then delete the corresponding `BackupRecord` rows directly:

```sql
DELETE FROM backup_records
WHERE started_at < DATE_SUB(NOW(), INTERVAL 14 DAY);
```
