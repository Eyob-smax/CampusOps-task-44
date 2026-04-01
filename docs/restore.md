# Restore Runbook

## Overview

CampusOps backup manifests are JSON files containing row counts and metadata.
They are **not** full data dumps; they serve as audit checkpoints and
health-verification snapshots. For a full restore you need a separate database
dump (e.g., mysqldump). This runbook covers both scenarios.

---

## Step 1 — Locate the backup manifest

List available backups via API:

```
GET /api/backups?status=completed&limit=50
```

Or check the backup directory directly:

```bash
ls -lh /var/campusops/backups/
```

Identify the manifest file for the desired point-in-time, e.g.:

```
backup_2026-03-30_030000.json
```

---

## Step 2 — Verify the manifest before restore

```
POST /api/backups/:id/verify
```

Confirm `passed: true` in the response. If `passed: false`, check `details` for
the reason (missing file, parse error, missing keys).

---

## Step 3a — Restore from a database dump (recommended for full data recovery)

1. Stop all backend services to prevent writes during restore.

```bash
pm2 stop campusops-api
```

2. Restore the MySQL dump:

```bash
mysql -u <user> -p <database> < /path/to/dump_2026-03-30.sql
```

3. Restart backend services:

```bash
pm2 start campusops-api
```

4. Verify the application is healthy:

```
GET /api/health
```

---

## Step 3b — Partial / selective restore using the manifest

If you only need to verify which data existed at a point in time (not a full
restore), read the manifest:

```bash
cat /var/campusops/backups/backup_2026-03-30_030000.json | jq '.rowCounts'
```

This shows expected row counts per table at backup time. You can cross-reference
with the live database to identify discrepancies:

```sql
SELECT COUNT(*) FROM User;
SELECT COUNT(*) FROM Shipment;
-- etc.
```

---

## Step 4 — Re-run verification after restore

After restoring data, trigger a new backup to establish a fresh checkpoint:

```
POST /api/backups
```

Then verify the new backup:

```
POST /api/backups/:newId/verify
```

---

## Restore history / audit trail

All manual backup triggers and verifications are recorded in the `AuditLog`
table with action codes `RUN_BACKUP` and entity type `BackupRecord`.

Query restore-related audit entries:

```sql
SELECT actorId, action, entityId, createdAt, detail
FROM AuditLog
WHERE action IN ('RUN_BACKUP')
ORDER BY createdAt DESC
LIMIT 20;
```

---

## Notes

- The backup manifest does **not** contain row data, only counts.
- Always pair manifests with a proper mysqldump or database snapshot strategy
  for production disaster recovery.
- Backup files are retained for 14 days by default. Ensure long-term archives
  are stored separately (e.g., copied to S3 or an off-site volume).
