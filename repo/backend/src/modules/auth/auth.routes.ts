import { Router } from 'express';
import { login, refresh, logout, me, changePasswordHandler } from './auth.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { authRateLimiter } from '../../middleware/rate-limit.middleware';

const router = Router();

// POST /api/auth/login
router.post('/login', authRateLimiter, login);

// POST /api/auth/refresh
router.post('/refresh', authRateLimiter, refresh);

// POST /api/auth/logout  (requires valid token)
router.post('/logout', authenticate, logout);

// GET /api/auth/me  (current user info)
router.get('/me', authenticate, me);

// POST /api/auth/change-password
router.post('/change-password', authenticate, changePasswordHandler);

export default router;
