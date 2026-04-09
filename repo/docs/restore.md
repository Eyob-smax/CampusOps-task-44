# Restore Runbook

## Overview

CampusOps backups produce a SQL dump file plus a JSON manifest containing row
counts and metadata. The SQL dump is the restore artifact; the manifest is an
integrity/checkpoint artifact used to validate expected data shape before and
after restore.

---

## Step 1 — Locate backup artifacts

List available backups via API:

```
GET /api/backups?status=completed&limit=50
```

Or check the backup directory directly:

```bash
ls -lh /var/campusops/backups/
```

Identify the backup pair for the desired point-in-time, e.g.:

```
backup_2026-03-30_030000.sql
backup_2026-03-30_030000.json
```

---

## Step 2 — Verify backup integrity before restore

```
POST /api/backups/:id/verify
```

Confirm `passed: true` in the response. If `passed: false`, check `details` for
the reason (missing/empty dump file, parse error, missing manifest keys).

---

## Step 3a — Restore from the SQL dump (recommended for full data recovery)

1. Stop all backend services to prevent writes during restore.

```bash
docker compose stop reverse-proxy frontend backend
```

2. Restore the SQL dump:

```bash
docker compose exec -T db sh -c 'mysql -u"$MYSQL_USER" -p"$(cat /run/secrets/db_password)" "$MYSQL_DATABASE"' < /path/to/backup_2026-03-30_030000.sql
```

3. Restart backend services:

```bash
docker compose up -d backend frontend reverse-proxy
```

4. Verify the application is healthy:

```
GET /health
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

- The manifest does **not** contain row data; use the SQL dump for restore.
- For stronger disaster recovery posture, still mirror dumps to external/off-site
  storage in addition to local backup volume retention.
- Backup files are retained for 14 days by default. Ensure long-term archives
  are stored separately (e.g., copied to S3 or an off-site volume).
