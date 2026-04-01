import { Request, Response, NextFunction } from 'express';
import { getRedisClient } from '../lib/redis';
import { logger } from '../lib/logger';

const IDEMPOTENCY_TTL_SECONDS = 86_400; // 24 hours
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Idempotency middleware for mutating endpoints.
 * Requires X-Idempotency-Key header (UUIDv4).
 * On duplicate key within 24h: returns cached response without re-processing.
 * Fail-open on Redis errors so transient Redis issues don't block requests.
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

  const cacheKey = `campusops:idempotency:${key}`;
  const redis = getRedisClient();

  redis.get(cacheKey).then((cached) => {
    if (cached) {
      logger.info({ msg: 'Idempotency cache hit', key, correlationId: req.correlationId });
      const { status, body } = JSON.parse(cached) as { status: number; body: unknown };
      res.status(status).json(body);
      return;
    }

    // Intercept response to cache it
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode < 500) {
        redis
          .setex(cacheKey, IDEMPOTENCY_TTL_SECONDS, JSON.stringify({ status: res.statusCode, body }))
          .catch((err) => logger.error({ msg: 'Failed to cache idempotency response', err }));
      }
      return originalJson(body);
    };

    next();
  }).catch((err) => {
    logger.error({ msg: 'Idempotency Redis lookup failed — failing open', err });
    next(); // Fail open
  });
}

/** Alias for backward compatibility */
export { idempotency as idempotencyMiddleware };
