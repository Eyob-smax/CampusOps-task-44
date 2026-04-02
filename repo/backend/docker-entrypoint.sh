#!/usr/bin/env sh
# ============================================================
# Backend entrypoint — assembles DATABASE_URL from Docker
# secrets and component env vars, then runs migrations and
# starts the application.
# ============================================================
set -e

SECRET_PATH="/run/secrets/db_password"

if [ -f "$SECRET_PATH" ]; then
  # Trim CR/LF so Windows-edited secrets do not corrupt the connection URL.
  DB_PASSWORD=$(tr -d '\r\n' < "$SECRET_PATH")
else
  # Fallback for local dev without Docker secrets
  DB_PASSWORD="${DB_PASSWORD:-campusops_dev}"
fi

DB_USER_RAW="${DB_USER:-campusops}"
DB_HOST_RAW="${DB_HOST:-db}"
DB_PORT_RAW="${DB_PORT:-3306}"
DB_NAME_RAW="${DB_NAME:-campusops}"

case "$DB_PORT_RAW" in
  ''|*[!0-9]*)
    echo "[entrypoint] Invalid DB_PORT value: '$DB_PORT_RAW'" >&2
    exit 1
    ;;
esac

# Encode credentials so special characters in secrets do not break URL parsing.
DB_USER_ENCODED=$(node -p "encodeURIComponent(process.argv[1])" "$DB_USER_RAW")
DB_PASSWORD_ENCODED=$(node -p "encodeURIComponent(process.argv[1])" "$DB_PASSWORD")

export DATABASE_URL="mysql://${DB_USER_ENCODED}:${DB_PASSWORD_ENCODED}@${DB_HOST_RAW}:${DB_PORT_RAW}/${DB_NAME_RAW}"

echo "[entrypoint] Database host: ${DB_HOST_RAW}:${DB_PORT_RAW}/${DB_NAME_RAW}"
echo "[entrypoint] Syncing database schema (prisma db push)..."
npx prisma db push --schema ./prisma/schema.prisma --accept-data-loss

echo "[entrypoint] Seeding default data if needed..."
node dist/database/seeders/seed.js || echo "[entrypoint] Seed skipped (already seeded or error tolerated)"

echo "[entrypoint] Starting application..."
exec "$@"
