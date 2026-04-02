import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

/**
 * Structured HTTP request/response logger.
 * Logs method, path, status, duration, and correlation ID.
 * Skips /health to reduce noise in production.
 */
export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.path.startsWith('/health')) {
    return next();
  }

  const startMs = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startMs;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]({
      msg: 'HTTP request',
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  });

  next();
}
