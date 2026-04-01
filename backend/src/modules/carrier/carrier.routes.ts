import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { idempotency } from '../../middleware/idempotency.middleware';
import {
  getCarriers,
  getCarrier,
  createCarrierHandler,
  updateCarrierHandler,
} from './carrier.controller';

const router = Router();

router.get('/', authenticate, requirePermission('carrier:read'), getCarriers);
router.post('/', authenticate, requirePermission('carrier:write'), idempotency, createCarrierHandler);
router.get('/:id', authenticate, requirePermission('carrier:read'), getCarrier);
router.put('/:id', authenticate, requirePermission('carrier:write'), idempotency, updateCarrierHandler);

export default router;
