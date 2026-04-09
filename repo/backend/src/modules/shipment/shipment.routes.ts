import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { idempotency } from '../../middleware/idempotency.middleware';
import { privilegedApiSigningForScope } from '../../middleware/api-signing.middleware';
import {
  listShipmentsHandler,
  getShipmentHandler,
  createShipmentHandler,
  updateStatusHandler,
  triggerSyncHandler,
} from './shipment.controller';

const router = Router();

router.get(
  '/',
  authenticate,
  requirePermission('shipment:read'),
  listShipmentsHandler,
);

router.post(
  '/',
  authenticate,
  requirePermission('shipment:write'),
  idempotency,
  createShipmentHandler,
);

router.get(
  '/:id',
  authenticate,
  requirePermission('shipment:read'),
  getShipmentHandler,
);

router.patch(
  '/:id/status',
  authenticate,
  requirePermission('shipment:intervene'),
  idempotency,
  updateStatusHandler,
);

// Carrier sync — accepts both JWT auth and API signing for on-prem integrations
router.post(
  '/sync/:carrierId',
  authenticate,
  requirePermission('shipment:intervene'),
  triggerSyncHandler,
);

// API-signed carrier sync endpoint for on-prem connectors
router.post(
  '/sync-signed/:carrierId',
  privilegedApiSigningForScope('carrier'),
  triggerSyncHandler,
);

export default router;
