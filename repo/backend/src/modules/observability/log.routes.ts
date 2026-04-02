import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { searchLogsHandler } from './log.controller';

const router = Router();

// GET /logs — search log files
router.get('/logs', authenticate, requirePermission('logs:read'), searchLogsHandler);

export default router;
