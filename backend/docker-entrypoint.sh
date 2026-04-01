#!/usr/bin/env sh
# ============================================================
# Backend entrypoint — assembles DATABASE_URL from Docker
# secrets and component env vars, then runs migrations and
# starts the application.
# ============================================================
set -e

SECRET_PATH="/run/secrets/db_password"

if [ -f "$SECRET_PATH" ]; then
  DB_PASSWORD=$(cat "$SECRET_PATH")
else
  # Fallback for local dev without Docker secrets
  DB_PASSWORD="${DB_PASSWORD:-campusops_dev}"
fi

export DATABASE_URL="mysql://${DB_USER:-campusops}:${DB_PASSWORD}@${DB_HOST:-db}:${DB_PORT:-3306}/${DB_NAME:-campusops}"

echo "[entrypoint] Database host: ${DB_HOST:-db}:${DB_PORT:-3306}/${DB_NAME:-campusops}"
echo "[entrypoint] Syncing database schema (prisma db push)..."
npx prisma db push --schema ./prisma/schema.prisma --accept-data-loss

echo "[entrypoint] Seeding default data if needed..."
node dist/database/seeders/seed.js || echo "[entrypoint] Seed skipped (already seeded or error tolerated)"

echo "[entrypoint] Starting application..."
exec "$@"
