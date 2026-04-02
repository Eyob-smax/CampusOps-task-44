import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import {
  getAnomaliesHandler,
  getAnomalyHandler,
  createAnomalyHandler,
  acknowledgeAnomalyHandler,
  assignAnomalyHandler,
  resolveAnomalyHandler,
  escalateAnomalyHandler,
} from './anomaly.controller';

const router = Router();

router.use(authenticate);

// Read
router.get('/',    requirePermission('classroom:read'),   getAnomaliesHandler);
router.get('/:id', requirePermission('classroom:read'),   getAnomalyHandler);

// Create (admin/supervisor — classroom:manage)
router.post('/', requirePermission('classroom:manage'), createAnomalyHandler);

// State transitions
router.patch('/:id/acknowledge', requirePermission('anomaly:acknowledge'), acknowledgeAnomalyHandler);
router.patch('/:id/assign',      requirePermission('anomaly:assign'),      assignAnomalyHandler);
router.patch('/:id/resolve',     requirePermission('anomaly:resolve'),     resolveAnomalyHandler);
router.patch('/:id/escalate',    requirePermission('anomaly:resolve'),     escalateAnomalyHandler);

export default router;
