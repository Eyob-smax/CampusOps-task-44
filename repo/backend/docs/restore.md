# Runbook: Restore

## Overview

CampusOps does not perform automated in-place restore, but each backup run writes a SQL dump plus
JSON manifest. The SQL dump is used for restore. The manifest contains row-count checkpoints for
validation before and after restore.

This runbook documents:
1. How to verify backup artefacts before a restore.
2. How to perform a database restore from the generated SQL dump.
3. How to validate the restore was successful.

---

## Step 1 — Verify backup artefacts

Before restoring, confirm the most recent dump + manifest pair is valid:

```bash
# Find the latest backup files
ls -lt $BACKUP_PATH | head -5

# Manually inspect
cat $BACKUP_PATH/backup_YYYY-MM-DD_HHmmss.json | python3 -m json.tool
ls -lh $BACKUP_PATH/backup_YYYY-MM-DD_HHmmss.sql
```

Or use the API:

```
POST /api/backups/:id/verify
Authorization: Bearer <admin-token>
```

Expected response when healthy:
```json
{ "success": true, "data": { "passed": true, "details": "Manifest valid. Tables: 19." } }
```

If verification fails (`passed: false`), investigate before proceeding. The `details` field
describes what is wrong (missing/empty dump file, missing keys, JSON parse error).

---

## Step 2 — Stop the application

Prevent writes during restore:

```bash
# Docker Compose
docker compose stop backend

# Or send a graceful SIGTERM
kill -SIGTERM <pid>
```

---

## Step 3 — Restore MySQL from the SQL dump

```bash
# Drop and recreate the database
mysql -h $DB_HOST -u root -p -e "DROP DATABASE campusops; CREATE DATABASE campusops CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Restore from CampusOps backup dump
mysql -h $DB_HOST -u root -p campusops < $BACKUP_PATH/backup_YYYY-MM-DD_HHmmss.sql
```

If using binary logs to restore to a specific point in time:

```bash
mysqlbinlog /var/lib/mysql/binlog.* --start-datetime="2024-01-15 01:00:00" --stop-datetime="2024-01-15 02:00:00" | mysql -u root -p campusops
```

---

## Step 4 — Run Prisma migrations

Ensure the schema is up to date after restore:

```bash
cd backend
npx prisma migrate deploy
```

---

## Step 5 — Validate the restore

After restarting the application, confirm row counts match the backup manifest:

```bash
# Get row counts from API (requires auth)
GET /api/backups/:id  # view the manifest rowCounts

# Cross-check against live DB
mysql -h $DB_HOST -u campusops -p campusops -e "SELECT COUNT(*) FROM users;"
```

Trigger a new backup to create a fresh baseline:

```
POST /api/backups
Authorization: Bearer <admin-token>
```

Then verify it:

```
POST /api/backups/:new-id/verify
Authorization: Bearer <admin-token>
```

---

## Step 6 — Restart and monitor

```bash
docker compose start backend
```

Monitor:
- Application logs: `msg: "Background jobs registered"`
- Check BullMQ queues are processing (heartbeat job should fire within 30s)
- Check `/health` endpoint returns `200`

---

## Rollback

If the restore worsens the situation, restore from the next-oldest SQL backup and repeat from Step 3.
