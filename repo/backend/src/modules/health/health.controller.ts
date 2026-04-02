import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { getRedisClient } from '../../lib/redis';
import { logger } from '../../lib/logger';

const startedAt = new Date();

/** GET /health — liveness probe */
export async function liveness(_req: Request, res: Response): Promise<void> {
  res.status(200).json({
    status: 'ok',
    uptime: Math.floor((Date.now() - startedAt.getTime()) / 1000),
  });
}

/** GET /health/ready — readiness probe (checks DB + Redis) */
export async function readiness(_req: Request, res: Response): Promise<void> {
  const checks: Record<string, 'ok' | 'fail'> = {
    database: 'fail',
    redis: 'fail',
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch (err) {
    logger.error({ msg: 'Readiness: database check failed', err });
  }

  try {
    await getRedisClient().ping();
    checks.redis = 'ok';
  } catch (err) {
    logger.error({ msg: 'Readiness: redis check failed', err });
  }

  const allOk = Object.values(checks).every((v) => v === 'ok');
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ready' : 'degraded',
    checks,
  });
}

/** GET /health/info — service information */
export function serviceInfo(_req: Request, res: Response): void {
  res.status(200).json({
    name: 'campusops-backend',
    version: process.env.npm_package_version ?? '1.0.0',
    environment: process.env.NODE_ENV ?? 'unknown',
    nodeVersion: process.version,
    uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    startedAt: startedAt.toISOString(),
    pid: process.pid,
  });
}
