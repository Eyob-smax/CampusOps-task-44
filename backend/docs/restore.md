# Runbook: Restore

## Overview

CampusOps does not perform automated data restore from the backup manifests because the manifests
contain row counts only, not row data. A full restore requires access to a MySQL binary log backup
or a `mysqldump` file taken by the infrastructure team outside of this application.

This runbook documents:
1. How to verify a backup manifest is intact before a restore.
2. How to perform a database restore from a `mysqldump` file.
3. How to validate the restore was successful.

---

## Step 1 — Verify the backup manifest

Before restoring, confirm the most recent backup manifest is valid:

```bash
# Find the latest manifest
ls -lt $BACKUP_PATH | head -5

# Manually inspect
cat $BACKUP_PATH/backup_YYYY-MM-DD_HHmmss.json | python3 -m json.tool
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
describes what is wrong (missing keys, file not found, JSON parse error).

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

## Step 3 — Restore MySQL from a dump

```bash
# Drop and recreate the database
mysql -h $DB_HOST -u root -p -e "DROP DATABASE campusops; CREATE DATABASE campusops CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Restore from dump
mysql -h $DB_HOST -u root -p campusops < /path/to/campusops_YYYY-MM-DD.sql
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

If the restore worsens the situation, restore from the next-oldest `mysqldump` and repeat from Step 3.
