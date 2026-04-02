-- ============================================================
-- CampusOps — MySQL initialization
-- Sets default charset and collation for the database.
-- Runs automatically via /docker-entrypoint-initdb.d/
-- ============================================================

ALTER DATABASE campusops
  CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- Prisma migrate deploy will create all tables.
-- This file only ensures correct charset before migration runs.
