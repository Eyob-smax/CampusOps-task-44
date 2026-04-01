import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRedisClient } from '../lib/redis';
import { config } from '../config';
import { Request, Response } from 'express';

function buildStore(prefix: string) {
  return new RedisStore({
    prefix: `campusops:rl:${prefix}:`,
    // ioredis send_command compatibility shim
    sendCommand: ((...args: string[]) =>
      getRedisClient().call(args[0]!, ...args.slice(1)) as Promise<unknown>) as any,
  });
}

/** 100 req/min per IP — applied globally */
export const globalRateLimiter = rateLimit({
  windowMs: config.rateLimit.global.windowMs,
  max: config.rateLimit.global.max,
  standardHeaders: true,
  legacyHeaders: false,
  store: buildStore('global'),
  keyGenerator: (req: Request) => req.ip ?? 'unknown',
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Too many requests. Please slow down.',
      code: 'RATE_LIMITED',
    });
  },
  skip: (req: Request) => req.path.startsWith('/health'),
});

/** 20 req/min per IP — applied on auth routes */
export const authRateLimiter = rateLimit({
  windowMs: config.rateLimit.auth.windowMs,
  max: config.rateLimit.auth.max,
  standardHeaders: true,
  legacyHeaders: false,
  store: buildStore('auth'),
  keyGenerator: (req: Request) => req.ip ?? 'unknown',
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts. Try again in a minute.',
      code: 'RATE_LIMITED',
    });
  },
});
