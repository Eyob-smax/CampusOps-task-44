import fs from 'fs';
import path from 'path';

const isTestEnv = (process.env.NODE_ENV ?? 'development') === 'test';
const isProductionEnv = (process.env.NODE_ENV ?? 'development') === 'production';

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => v.replace(/\/+$/, ''));
}

function envBoolean(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return raw.toLowerCase() === 'true';
}

function envPositiveInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return parsed;
}

function readSecret(secretName: string, envFallback?: string): string {
  const secretPath = `/run/secrets/${secretName}`;
  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, 'utf-8').trim();
  }
  if (envFallback && process.env[envFallback]) {
    return process.env[envFallback]!;
  }
  // Dev fallback — throw only in production
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `Required secret '${secretName}' not found and no env fallback '${envFallback}' set.`
    );
  }
  return `dev-${secretName}-insecure`;
}

// Build DATABASE_URL from component parts + Docker secret
function buildDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const password = readSecret('db_password', 'DB_PASSWORD');
  const host = process.env.DB_HOST ?? 'localhost';
  const port = process.env.DB_PORT ?? '3306';
  const name = process.env.DB_NAME ?? 'campusops';
  const user = process.env.DB_USER ?? 'campusops';
  return `mysql://${user}:${encodeURIComponent(password)}@${host}:${port}/${name}`;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),

  database: {
    url: buildDatabaseUrl(),
  },

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },

  security: {
    enforceTls: envBoolean('ENFORCE_TLS', isProductionEnv),
    authRedisFailOpen: envBoolean('AUTH_REDIS_FAIL_OPEN', isTestEnv),
    idempotencyRedisFailOpen: envBoolean('IDEMPOTENCY_REDIS_FAIL_OPEN', isTestEnv),
  },

  cors: {
    allowedOrigins: parseCsv(
      process.env.CORS_ALLOWED_ORIGINS ??
        'https://localhost,https://127.0.0.1,https://localhost:443,https://127.0.0.1:443',
    ),
    allowRequestsWithoutOrigin: envBoolean('CORS_ALLOW_REQUESTS_WITHOUT_ORIGIN', true),
  },

  jwt: {
    secret: readSecret('jwt_secret', 'JWT_SECRET'),
    accessExpiresIn: '15m',
    refreshExpiresIn: '8h',
    refreshCookieName: process.env.REFRESH_TOKEN_COOKIE_NAME ?? 'refreshToken',
    refreshCookieSecure: envBoolean('REFRESH_TOKEN_COOKIE_SECURE', isProductionEnv),
  },

  encryption: {
    // Must be a 64-char hex string (32 bytes)
    key: readSecret('encryption_key', 'ENCRYPTION_KEY'),
  },

  storage: {
    path: process.env.STORAGE_PATH ?? path.join(process.cwd(), 'storage'),
    maxFileSizeBytes: 10 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png'] as string[],
  },

  logs: {
    path: process.env.LOG_PATH ?? path.join(process.cwd(), 'logs'),
    retentionDays: 30,
    level: process.env.LOG_LEVEL ?? 'info',
  },

  backup: {
    path: process.env.BACKUP_PATH ?? path.join(process.cwd(), 'backups'),
    retentionDays: envPositiveInt('BACKUP_RETENTION_DAYS', 14),
    scheduleCron: process.env.BACKUP_SCHEDULE_CRON ?? '0 2 * * *',
  },

  rateLimit: {
    // Keep limiter active in tests for header assertions, but avoid suite-wide throttling.
    global: { windowMs: 60_000, max: isTestEnv ? 10_000 : 100 },
    auth: { windowMs: 60_000, max: isTestEnv ? 5_000 : 20 },
  },

  circuitBreaker: {
    timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT_MS ?? '5000', 10),
    errorThresholdPercentage: parseInt(process.env.CIRCUIT_BREAKER_ERROR_THRESHOLD_PERCENT ?? '50', 10),
    resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT_MS ?? '600000', 10),
    rollingCountTimeout: parseInt(process.env.CIRCUIT_BREAKER_ROLLING_COUNT_TIMEOUT_MS ?? '120000', 10),
    rollingCountBuckets: parseInt(process.env.CIRCUIT_BREAKER_ROLLING_COUNT_BUCKETS ?? '12', 10),
    volumeThreshold: parseInt(process.env.CIRCUIT_BREAKER_VOLUME_THRESHOLD ?? '5', 10),
  },

  classroom: {
    heartbeatStaleSeconds: 90,
    anomalyEscalationMinutes: 30,
  },

  parking: {
    alertSlaMinutes: 15,
    secondLevelEscalationMinutes: 30,
    sessionOvertimeMinutes: envPositiveInt('PARKING_OVERTIME_MINUTES', 120),
    unsettledGraceMinutes: envPositiveInt('PARKING_UNSETTLED_GRACE_MINUTES', 10),
  },

  shipmentSync: {
    intervalMinutes: 15,
    maxRetries: 4,
    backoffDelaysMs: [30_000, 120_000, 480_000, 1_920_000] as number[],
    mode: process.env.CARRIER_SYNC_MODE ?? (isProductionEnv ? 'connector' : 'simulation'),
    connectorTimeoutMs: parseInt(process.env.CARRIER_SYNC_TIMEOUT_MS ?? '5000', 10),
    allowSimulationFallback: envBoolean('CARRIER_SYNC_ALLOW_SIMULATION_FALLBACK', !isProductionEnv),
  },

  perceptualHash: {
    hammingDistanceThreshold: 10,
  },
} as const;

// Expose DATABASE_URL for Prisma client (reads from process.env on import)
process.env.DATABASE_URL = config.database.url;
