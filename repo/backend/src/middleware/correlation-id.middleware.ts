import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

/**
 * Assigns a unique correlation ID to every request.
 * Uses the incoming X-Correlation-Id header if present,
 * otherwise generates a new UUIDv4. The ID is echoed in
 * the response header for client-side tracing.
 */
export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const incoming = req.headers['x-correlation-id'] as string | undefined;
  req.correlationId = incoming?.trim() || uuidv4();
  res.setHeader('X-Correlation-Id', req.correlationId);
  next();
}
