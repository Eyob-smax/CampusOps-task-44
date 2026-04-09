#!/usr/bin/env sh
# ============================================================
# Backend entrypoint - assembles DATABASE_URL from Docker
# secrets and component env vars, then runs migrations and
# starts the application.
# ============================================================
set -e

is_placeholder_value() {
  value="$1"
  case "$value" in
    ""|CHANGE_ME_*|change_me_*|PLACEHOLDER_*|placeholder_*)
      return 0
      ;;
    "Admin#12345"|"OpsManager#12345"|"Supervisor#12345"|"CsAgent#12345"|"Auditor#12345")
      return 0
      ;;
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"|"1111111111111111111111111111111111111111111111111111111111111111")
      return 0
      ;;
  esac
  return 1
}

is_valid_encryption_key() {
  echo "$1" | grep -Eq '^[0-9a-fA-F]{64}$'
}

get_env_value() {
  var_name="$1"
  eval "printf '%s' \"\${$var_name-}\""
}

resolve_secret_or_env() {
  secret_name="$1"
  env_name="$2"
  secret_file="/run/secrets/${secret_name}"

  if [ -f "$secret_file" ]; then
    tr -d '\r\n' < "$secret_file"
    return
  fi

  get_env_value "$env_name"
}

require_non_placeholder_secret_or_env() {
  secret_name="$1"
  env_name="$2"
  label="$3"
  value="$(resolve_secret_or_env "$secret_name" "$env_name")"

  if is_placeholder_value "$value"; then
    echo "[entrypoint] ${label} uses a placeholder or insecure default value. Set a rotated value before startup." >&2
    exit 1
  fi

  if [ "$secret_name" = "encryption_key" ] && ! is_valid_encryption_key "$value"; then
    echo "[entrypoint] ENCRYPTION_KEY must be a 64-character hex string." >&2
    exit 1
  fi
}

require_non_placeholder_env_if_set() {
  env_name="$1"
  value="$(get_env_value "$env_name")"

  if [ -z "$value" ]; then
    return
  fi

  if is_placeholder_value "$value"; then
    echo "[entrypoint] ${env_name} uses a placeholder or insecure default value. Set a rotated value or unset it to skip seeding." >&2
    exit 1
  fi
}

if [ "${NODE_ENV:-development}" != "test" ]; then
  require_non_placeholder_secret_or_env "db_password" "DB_PASSWORD" "Database password"
  require_non_placeholder_secret_or_env "jwt_secret" "JWT_SECRET" "JWT secret"
  require_non_placeholder_secret_or_env "encryption_key" "ENCRYPTION_KEY" "Encryption key"

  require_non_placeholder_env_if_set "SEED_ADMIN_PASSWORD"
  require_non_placeholder_env_if_set "SEED_OPS_MANAGER_PASSWORD"
  require_non_placeholder_env_if_set "SEED_SUPERVISOR_PASSWORD"
  require_non_placeholder_env_if_set "SEED_CS_AGENT_PASSWORD"
  require_non_placeholder_env_if_set "SEED_AUDITOR_PASSWORD"
fi

SECRET_PATH="/run/secrets/db_password"

if [ -f "$SECRET_PATH" ]; then
  DB_PASSWORD=$(cat "$SECRET_PATH")
else
  DB_PASSWORD="${DB_PASSWORD:-}"
fi

if [ -z "$DB_PASSWORD" ]; then
  echo "[entrypoint] Missing database password. Provide /run/secrets/db_password or DB_PASSWORD." >&2
  exit 1
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
MIGRATIONS_DIR="./prisma/migrations"
HAS_MIGRATIONS="false"

if [ -d "$MIGRATIONS_DIR" ]; then
  MIGRATION_COUNT=$(find "$MIGRATIONS_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
  if [ "${MIGRATION_COUNT}" -gt 0 ] 2>/dev/null; then
    HAS_MIGRATIONS="true"
  fi
fi

if [ "$HAS_MIGRATIONS" = "true" ]; then
  echo "[entrypoint] Applying Prisma migrations (prisma migrate deploy)..."
  npx prisma migrate deploy --schema ./prisma/schema.prisma
else
  if [ "${NODE_ENV:-development}" = "production" ]; then
    echo "[entrypoint] No Prisma migrations found. Refusing schema sync in production." >&2
    exit 1
  fi

  echo "[entrypoint] No migrations found; running prisma db push for non-production startup..."
  npx prisma db push --schema ./prisma/schema.prisma
fi

echo "[entrypoint] Seeding default data if needed..."
node dist/database/seeders/seed.js || echo "[entrypoint] Seed skipped (already seeded or error tolerated)"

echo "[entrypoint] Starting application..."
exec "$@"
