import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { idempotencyMiddleware } from '../../middleware/idempotency.middleware';
import {
  getLatestMetricsHandler,
  getMetricHistoryHandler,
  listAlertHistoryHandler,
  acknowledgeAlertHandler,
} from './metrics.controller';

const router = Router();

// GET /metrics — latest snapshot per metric
router.get('/metrics', authenticate, requirePermission('metrics:read'), getLatestMetricsHandler);

// GET /metrics/:name/history — time-series for a specific metric
router.get('/metrics/:name/history', authenticate, requirePermission('metrics:read'), getMetricHistoryHandler);

// GET /alerts — alert history
router.get('/alerts', authenticate, requirePermission('alerts:read'), listAlertHistoryHandler);

// PATCH /alerts/:id/acknowledge — acknowledge a specific alert
router.patch(
  '/alerts/:id/acknowledge',
  authenticate,
  requirePermission('alerts:manage'),
  idempotencyMiddleware,
  acknowledgeAlertHandler,
);

export default router;
