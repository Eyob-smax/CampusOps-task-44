import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import type { UserRole, AuthenticatedUser } from '../types';
import { can, type Permission } from '../lib/permissions';
import { getRedisClient } from '../lib/redis';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      correlationId: string;
    }
  }
}

/** JWT authentication — attaches req.user or returns 401 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or invalid Authorization header', code: 'UNAUTHORIZED' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.jwt.secret) as AuthenticatedUser & { jti?: string };

    // Check token blacklist (revoked tokens, e.g. after logout)
    const jti = payload.jti;
    if (jti) {
      getRedisClient().get(`campusops:revoked:${jti}`).then((revoked) => {
        if (revoked) {
          res.status(401).json({ success: false, error: 'Token has been revoked', code: 'TOKEN_REVOKED' });
          return;
        }
        req.user = { id: payload.id, username: payload.username, role: payload.role };
        next();
      }).catch(() => {
        // Fail open on Redis error — don't block legitimate traffic
        req.user = { id: payload.id, username: payload.username, role: payload.role };
        next();
      });
    } else {
      req.user = { id: payload.id, username: payload.username, role: payload.role };
      next();
    }
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token', code: 'UNAUTHORIZED' });
  }
}

/** Role-based authorization — used when you know the exact roles */
export function authorize(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthenticated', code: 'UNAUTHORIZED' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, error: 'Insufficient permissions', code: 'FORBIDDEN' });
      return;
    }
    next();
  };
}

/** Permission-based authorization — preferred, uses the permission matrix */
export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthenticated', code: 'UNAUTHORIZED' });
      return;
    }
    if (!can(req.user.role, permission)) {
      res.status(403).json({
        success: false,
        error: `Permission denied: ${permission}`,
        code: 'FORBIDDEN',
      });
      return;
    }
    next();
  };
}

/** Auditor guard — allows read access but blocks all write operations */
export function denyAuditorWrites() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.user?.role === 'auditor' && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      res.status(403).json({
        success: false,
        error: 'Auditors have read-only access',
        code: 'FORBIDDEN',
      });
      return;
    }
    next();
  };
}
