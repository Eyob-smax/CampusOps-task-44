import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { idempotency } from '../../middleware/idempotency.middleware';
import {
  listThresholdsHandler,
  getThresholdByIdHandler,
  createThresholdHandler,
  updateThresholdHandler,
  deleteThresholdHandler,
} from './threshold.controller';

const router = Router();

// All threshold routes require authentication
router.use(authenticate);

// GET /thresholds — list all thresholds
router.get('/thresholds', requirePermission('alerts:read'), listThresholdsHandler);

// POST /thresholds — create threshold
router.post('/thresholds', requirePermission('alerts:manage'), idempotency, createThresholdHandler);

// GET /thresholds/:id — get single threshold
router.get('/thresholds/:id', requirePermission('alerts:read'), getThresholdByIdHandler);

// PUT /thresholds/:id — update threshold
router.put('/thresholds/:id', requirePermission('alerts:manage'), idempotency, updateThresholdHandler);

// DELETE /thresholds/:id — delete threshold
router.delete('/thresholds/:id', requirePermission('alerts:manage'), deleteThresholdHandler);

export default router;
