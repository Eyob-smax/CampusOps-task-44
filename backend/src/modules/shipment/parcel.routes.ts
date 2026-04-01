import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { idempotency } from '../../middleware/idempotency.middleware';
import {
  listParcelsHandler,
  getParcelHandler,
  addParcelHandler,
  updateParcelStatusHandler,
} from './parcel.controller';

const router = Router();

router.get(
  '/',
  authenticate,
  requirePermission('shipment:read'),
  listParcelsHandler,
);

router.post(
  '/',
  authenticate,
  requirePermission('shipment:write'),
  idempotency,
  addParcelHandler,
);

router.get(
  '/:id',
  authenticate,
  requirePermission('shipment:read'),
  getParcelHandler,
);

router.patch(
  '/:id/status',
  authenticate,
  requirePermission('shipment:write'),
  updateParcelStatusHandler,
);

export default router;
