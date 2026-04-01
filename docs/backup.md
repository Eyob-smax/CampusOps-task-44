# Backup Runbook

## Overview

CampusOps uses a manifest-based backup system. Each backup captures row counts
from every Prisma model and writes a JSON manifest file to the configured backup
directory. Backups are tracked in the `BackupRecord` database table.

---

## Where backup files are stored

The backup directory is controlled by the environment variable / config value:

```
config.backup.path   (default: ./backups)
```

Set `BACKUP_PATH` (or equivalent in your config module) to point to a persistent
volume in production (e.g., `/var/campusops/backups`).

Each file is named:

```
backup_YYYY-MM-DD_HHmmss.json
```

Example: `backup_2026-03-31_030000.json`

---

## Triggering a backup

### Automatic (scheduled)

The BullMQ worker `campusops:backup` runs on the schedule defined in the job
scheduler (typically daily at 03:00 UTC). It calls `runBackup('system')` and
then enforces retention.

### Manual via API

```
POST /api/backups
Authorization: Bearer <token with backup:manage permission>
```

Response includes the `BackupRecord` with `status: "completed"` (or `"failed"`
if the backup errored).

### Manual via code / script

```typescript
import { runBackup } from './modules/observability/backup.service';
const record = await runBackup('admin-user-id');
console.log(record.id, record.filePath);
```

---

## Checking BackupRecord status

Query the database directly:

```sql
SELECT id, fileName, status, verifyStatus, startedAt, finishedAt, errorMsg
FROM BackupRecord
ORDER BY startedAt DESC
LIMIT 20;
```

Or via API:

```
GET /api/backups?page=1&limit=20
GET /api/backups/:id
```

Status values:
- `running`   — backup in progress
- `completed` — backup written to disk successfully
- `failed`    — backup errored; check `errorMsg` column

VerifyStatus values:
- `pending` — not yet verified
- `passed`  — manifest parsed and all keys present
- `failed`  — file missing or manifest malformed

---

## Verifying a backup

```
POST /api/backups/:id/verify
```

Or in code:

```typescript
import { verifyBackup } from './modules/observability/backup.service';
const { passed, details } = await verifyBackup(backupId);
```

The verify step checks:
1. The file exists at `filePath`.
2. The file parses as valid JSON.
3. The manifest contains all required keys: `id`, `timestamp`, `tables`, `rowCounts`.
4. `tables` is a non-empty array.
5. `rowCounts` is an object.

---

## Backup retention

Backups older than `config.backup.retentionDays` (default: **14 days**) are
automatically deleted by the daily backup worker after each successful run.

To change retention, set `BACKUP_RETENTION_DAYS` in your environment (or update
`config.backup.retentionDays`).

To run retention manually:

```typescript
import { enforceRetention } from './modules/observability/backup.service';
const { deleted } = await enforceRetention(14); // pass custom days if needed
console.log(`Deleted ${deleted} old backups`);
```

---

## Troubleshooting

| Problem | Action |
|---------|--------|
| `status: "failed"`, errorMsg present | Check disk space; check `BACKUP_PATH` is writable |
| File missing after backup | Confirm the backup directory is on a persistent volume |
| Worker never runs | Check BullMQ scheduler in `jobs/schedulers`; check Redis connectivity |
| `verifyStatus: "failed"` | File may have been manually deleted or is corrupt; re-run backup |
