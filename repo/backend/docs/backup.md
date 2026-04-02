# Runbook: Backup

## Overview

Daily backups run automatically at 02:00 UTC via the `campusops:backup` BullMQ job. Each backup
produces a SQL dump plus a JSON manifest written to the `BACKUP_PATH` directory (default:
`./backups`). The manifest records row counts for all major Prisma models and is the verification
artefact paired with the dump.

A `BackupRecord` row is created in the database for every run, tracking status
(`running` → `completed` | `failed`) and verify status (`pending` → `passed` | `failed`).

---

## Configuration

| Variable      | Default            | Description                          |
|---------------|--------------------|--------------------------------------|
| `BACKUP_PATH` | `./backups`        | Directory where dump + manifest files land |
| `BACKUP_SCHEDULE_CRON` | `0 2 * * *` | Cron expression for daily run  |

`BACKUP_PATH` must be writable by the Node process. On a containerised deployment, mount a
persistent volume at this path.

---

## Manual Trigger

**Via API (authenticated, requires `backup:manage` permission):**

```
POST /api/backups
Authorization: Bearer <token>
```

**Via BullMQ (from a Node REPL or admin script):**

```ts
import { backupQueue } from './src/jobs';
await backupQueue.add('daily-backup', {}, { jobId: `manual-${Date.now()}` });
```

---

## What the Backup Produces

Files:
- `backup_YYYY-MM-DD_HHmmss.sql`
- `backup_YYYY-MM-DD_HHmmss.json`

```json
{
  "id": "<BackupRecord.id>",
  "timestamp": "2024-01-15T02:00:12.345Z",
  "tables": ["User", "Role", "Shipment", ...],
  "rowCounts": {
    "User": 142,
    "Role": 4,
    "Shipment": 1023,
    ...
  }
}
```

The manifest does **not** contain row data. The SQL dump is the restore artifact.

---

## Verifying a Backup

**Via API:**

```
POST /api/backups/:id/verify
Authorization: Bearer <token>
```

Verification checks:
1. Dump file exists at the stored `filePath` and is non-empty.
2. Companion manifest is present (or backup is treated as legacy when absent).
3. If present, manifest is valid JSON with keys: `id`, `timestamp`, `tables`, `rowCounts`.
4. `tables` array is non-empty.
5. `rowCounts` is a plain object.

The `BackupRecord.verifyStatus` is updated to `passed` or `failed`.

---

## Monitoring

- Check `BackupRecord` rows where `status = 'failed'` or `verifyStatus = 'failed'`.
- Winston logs: search for `msg: "Backup completed"` or `msg: "Backup failed"`.
- Socket.IO `/jobs` namespace emits `job:update` events; the frontend MetricsView shows the last 10 backups.

---

## Retention

Backups older than 14 days are automatically deleted by the `campusops:log-retention` job
(which also calls `enforceRetention`). Both dump/manifest files and the `BackupRecord` row are removed.

To change the retention period, set `BACKUP_RETENTION_DAYS` or update `config.backup.retentionDays`.
