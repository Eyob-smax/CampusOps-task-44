import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(404, `${resource} not found`, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message, 'VALIDATION_ERROR');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(403, message, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, 'CONFLICT');
  }
}

/**
 * Global error handler — must be registered last in Express.
 * Normalizes all errors into a consistent JSON response shape.
 */
export function errorHandlerMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const correlationId = req.correlationId;

  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
      correlationId,
    });
    return;
  }

  // Known application errors
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ msg: 'Application error', err, correlationId });
    }
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
      correlationId,
    });
    return;
  }

  // Prisma unique constraint violation
  if (isObject(err) && (err as Record<string, unknown>).code === 'P2002') {
    const meta = (err as Record<string, unknown>).meta as Record<string, unknown> | undefined;
    res.status(409).json({
      success: false,
      error: `Duplicate value for field: ${(meta?.target as string[] | undefined)?.join(', ')}`,
      code: 'CONFLICT',
      correlationId,
    });
    return;
  }

  // Prisma record not found
  if (isObject(err) && (err as Record<string, unknown>).code === 'P2025') {
    res.status(404).json({
      success: false,
      error: 'Record not found',
      code: 'NOT_FOUND',
      correlationId,
    });
    return;
  }

  // Unknown error — log and return 500
  logger.error({ msg: 'Unhandled error', err, correlationId });
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    correlationId,
  });
}

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}
