import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import {
  getAlertsHandler,
  getAlertHandler,
  createAlertHandler,
  claimAlertHandler,
  closeAlertHandler,
  escalateAlertHandler,
  getMetricsHandler,
} from './alert.controller';

const router = Router();
router.use(authenticate);

router.get('/metrics',          requirePermission('parking:read'),    getMetricsHandler);
router.get('/',                 requirePermission('parking:read'),    getAlertsHandler);
router.get('/:id',              requirePermission('parking:read'),    getAlertHandler);
router.post('/',                requirePermission('parking:manage'),  createAlertHandler);
router.patch('/:id/claim',      requirePermission('parking-alert:claim'),  claimAlertHandler);
router.patch('/:id/close',      requirePermission('parking-alert:close'),  closeAlertHandler);
router.patch('/:id/escalate',   requirePermission('parking:manage'),  escalateAlertHandler);

export default router;
