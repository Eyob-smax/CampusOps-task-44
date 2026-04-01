import fs from 'fs';
import path from 'path';

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

  jwt: {
    secret: readSecret('jwt_secret', 'JWT_SECRET'),
    accessExpiresIn: '15m',
    refreshExpiresIn: '8h',
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
    retentionDays: 14,
    scheduleCron: '0 2 * * *',
  },

  rateLimit: {
    global: { windowMs: 60_000, max: 100 },
    auth: { windowMs: 60_000, max: 20 },
  },

  circuitBreaker: {
    timeout: 5_000,
    errorThresholdPercentage: 50,
    resetTimeout: 10_000,
  },

  classroom: {
    heartbeatStaleSeconds: 90,
    anomalyEscalationMinutes: 30,
  },

  parking: {
    alertSlaMinutes: 15,
    secondLevelEscalationMinutes: 30,
  },

  shipmentSync: {
    intervalMinutes: 15,
    maxRetries: 4,
    backoffDelaysMs: [30_000, 120_000, 480_000, 1_920_000] as number[],
  },

  perceptualHash: {
    hammingDistanceThreshold: 10,
  },
} as const;

// Expose DATABASE_URL for Prisma client (reads from process.env on import)
process.env.DATABASE_URL = config.database.url;
