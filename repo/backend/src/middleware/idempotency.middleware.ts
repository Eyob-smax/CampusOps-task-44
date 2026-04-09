import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getRedisClient } from '../lib/redis';
import { logger } from '../lib/logger';
import { config } from '../config';

const IDEMPOTENCY_TTL_SECONDS = 86_400; // 24 hours
const IN_PROGRESS_WAIT_MS = 5_000;
const IN_PROGRESS_POLL_MS = 100;
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type InProgressEntry = {
  state: 'in_progress';
  startedAt: number;
};

type CompletedEntry = {
  state: 'completed';
  status: number;
  body: unknown;
};

type CacheEntry = InProgressEntry | CompletedEntry;

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return '{}';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const serialized = entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',');
  return `{${serialized}}`;
}

function canonicalPath(req: Request): string {
  const raw = `${req.baseUrl ?? ''}${req.path ?? ''}` || req.path || '/';
  const normalized = raw.replace(/\/+$/g, '');
  return normalized || '/';
}

function buildCacheKey(req: Request, key: string): string {
  const method = req.method.toUpperCase();
  const path = canonicalPath(req);
  const bodyCanonical = stableStringify(req.body);
  const bodyHash = crypto.createHash('sha256').update(bodyCanonical).digest('hex');
  return `campusops:idempotency:${method}:${path}:${bodyHash}:${key}`;
}

function parseCacheEntry(raw: string): CacheEntry | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (
      parsed.state === 'completed'
      && typeof parsed.status === 'number'
      && Object.prototype.hasOwnProperty.call(parsed, 'body')
    ) {
      return {
        state: 'completed',
        status: parsed.status,
        body: parsed.body,
      };
    }

    if (parsed.state === 'in_progress' && typeof parsed.startedAt === 'number') {
      return {
        state: 'in_progress',
        startedAt: parsed.startedAt,
      };
    }

    // Backward compatibility for entries from the previous format.
    if (typeof parsed.status === 'number' && Object.prototype.hasOwnProperty.call(parsed, 'body')) {
      return {
        state: 'completed',
        status: parsed.status,
        body: parsed.body,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCompletedEntry(
  cacheKey: string,
): Promise<CompletedEntry | null> {
  const redis = getRedisClient();
  const deadline = Date.now() + IN_PROGRESS_WAIT_MS;

  while (Date.now() < deadline) {
    const cached = await redis.get(cacheKey);
    if (!cached) {
      return null;
    }

    const parsed = parseCacheEntry(cached);
    if (parsed?.state === 'completed') {
      return parsed;
    }

    await sleep(IN_PROGRESS_POLL_MS);
  }

  return null;
}

/**
 * Idempotency middleware for mutating endpoints.
 * Requires X-Idempotency-Key header (UUIDv4).
 * On duplicate key within 24h: returns cached response without re-processing.
 * Fails closed on Redis errors by default to preserve replay protection guarantees.
 * Can be set to fail-open via IDEMPOTENCY_REDIS_FAIL_OPEN=true.
 */
export function idempotency(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-idempotency-key'] as string | undefined;

  if (!key) {
    res.status(400).json({ success: false, error: 'X-Idempotency-Key header is required', code: 'MISSING_IDEMPOTENCY_KEY' });
    return;
  }

  if (!UUID_V4_REGEX.test(key)) {
    res.status(400).json({ success: false, error: 'X-Idempotency-Key must be a valid UUIDv4', code: 'INVALID_IDEMPOTENCY_KEY' });
    return;
  }

  const cacheKey = buildCacheKey(req, key);
  const redis = getRedisClient();

  const inProgressEntry: InProgressEntry = {
    state: 'in_progress',
    startedAt: Date.now(),
  };

  redis.set(
    cacheKey,
    JSON.stringify(inProgressEntry),
    'EX',
    IDEMPOTENCY_TTL_SECONDS,
    'NX',
  ).then(async (reservation) => {
    if (reservation === 'OK') {
      let finalized = false;
      const originalJson = res.json.bind(res);

      res.json = (body) => {
        if (!finalized) {
          finalized = true;
          if (res.statusCode < 500) {
            const completedEntry: CompletedEntry = {
              state: 'completed',
              status: res.statusCode,
              body,
            };

            redis
              .setex(cacheKey, IDEMPOTENCY_TTL_SECONDS, JSON.stringify(completedEntry))
              .catch((err) => logger.error({ msg: 'Failed to cache idempotency response', err }));
          } else {
            redis
              .del(cacheKey)
              .catch((err) => logger.error({ msg: 'Failed to clear idempotency lock after error response', err }));
          }
        }

        return originalJson(body);
      };

      // If a handler does not respond with JSON, do not leave stale in-progress locks behind.
      const cleanupIfUnfinalized = () => {
        if (!finalized) {
          redis
            .del(cacheKey)
            .catch((err) => logger.error({ msg: 'Failed to cleanup stale idempotency lock', err }));
        }
      };

      res.on('close', cleanupIfUnfinalized);
      res.on('finish', cleanupIfUnfinalized);

      next();
      return;
    }

    const cached = await redis.get(cacheKey);
    const parsed = cached ? parseCacheEntry(cached) : null;

    if (parsed?.state === 'completed') {
      logger.info({ msg: 'Idempotency cache hit', key, correlationId: req.correlationId });
      res.status(parsed.status).json(parsed.body);
      return;
    }

    const completed = await waitForCompletedEntry(cacheKey);
    if (completed) {
      logger.info({ msg: 'Idempotency replay after in-flight wait', key, correlationId: req.correlationId });
      res.status(completed.status).json(completed.body);
      return;
    }

    res.status(409).json({
      success: false,
      error: 'Request with the same idempotency key is still being processed',
      code: 'IDEMPOTENCY_IN_PROGRESS',
    });
  }).catch((err) => {
    if (config.security.idempotencyRedisFailOpen) {
      logger.error({ msg: 'Idempotency Redis lookup failed — fail-open mode', err });
      next();
      return;
    }

    logger.error({ msg: 'Idempotency Redis lookup failed — fail-closed mode', err });
    res.status(503).json({
      success: false,
      error: 'Idempotency storage unavailable',
      code: 'IDEMPOTENCY_UNAVAILABLE',
    });
  });
}

/** Alias for backward compatibility */
export { idempotency as idempotencyMiddleware };
