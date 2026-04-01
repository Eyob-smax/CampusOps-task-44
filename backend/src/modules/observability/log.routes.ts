import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { searchLogsHandler } from './log.controller';

const router = Router();

// All log routes require authentication
router.use(authenticate);

// GET /logs — search log files
router.get('/logs', requirePermission('logs:read'), searchLogsHandler);

export default router;
