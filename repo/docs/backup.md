# Backup Runbook

## Overview

CampusOps uses a manifest-based backup system. Each backup captures row counts
from every Prisma model, writes a JSON manifest, and stores a SQL dump file in
the configured backup directory. Backups are tracked in the `BackupRecord`
database table.

---

## Where backup files are stored

The backup directory is controlled by the environment variable / config value:

```
config.backup.path   (default: ./backups)
```

Set `BACKUP_PATH` (or equivalent in your config module) to point to a persistent
volume in production (e.g., `/var/campusops/backups`).

Each backup uses a matched dump/manifest pair:

```
backup_YYYY-MM-DD_HHmmss.sql
backup_YYYY-MM-DD_HHmmss.json
```

Example:
- `backup_2026-03-31_030000.sql`
- `backup_2026-03-31_030000.json`

---

## Triggering a backup

### Automatic (scheduled)

The BullMQ queue `campusops-backup` runs on `config.backup.scheduleCron`
(default: daily at 02:00 UTC) from `backend/src/jobs/index.ts`.
The worker executes `runBackup('system')`, runs `verifyBackup(...)` with restore
smoke testing, and then enforces retention.

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
- `passed`  — dump + manifest checks passed (and restore smoke test passed when enabled)
- `failed`  — verification failed (missing/empty dump, malformed manifest, or restore smoke test failure)

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
1. The dump file exists at `filePath` and has non-zero size.
2. The companion manifest (`.json`) exists, or the backup is treated as legacy when absent.
3. If manifest exists, it parses as JSON and includes: `id`, `timestamp`, `tables`, `rowCounts`.
4. `tables` is a non-empty array.
5. `rowCounts` is an object.
6. Optional restore smoke test imports the dump into a temporary database and validates the import.

---

## Backup retention

Backups older than `config.backup.retentionDays` (default: **14 days**) are
automatically deleted by the daily backup worker after each successful run.
Retention removes both SQL dump and JSON manifest files plus the corresponding
`BackupRecord` rows.

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
| Worker never runs | Check repeatable-job registration in `backend/src/jobs/index.ts`; check Redis connectivity |
| `verifyStatus: "failed"` | Dump/manifest may be missing or malformed; inspect verify `details` and re-run backup |
