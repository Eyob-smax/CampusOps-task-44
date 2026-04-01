import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import {
  getLatestMetricsHandler,
  getMetricHistoryHandler,
  listAlertHistoryHandler,
  acknowledgeAlertHandler,
} from './metrics.controller';

const router = Router();

// All observability routes require authentication
router.use(authenticate);

// GET /metrics — latest snapshot per metric
router.get('/metrics', requirePermission('metrics:read'), getLatestMetricsHandler);

// GET /metrics/:name/history — time-series for a specific metric
router.get('/metrics/:name/history', requirePermission('metrics:read'), getMetricHistoryHandler);

// GET /alerts — alert history
router.get('/alerts', requirePermission('alerts:read'), listAlertHistoryHandler);

// PATCH /alerts/:id/acknowledge — acknowledge a specific alert
router.patch('/alerts/:id/acknowledge', requirePermission('alerts:manage'), acknowledgeAlertHandler);

export default router;
