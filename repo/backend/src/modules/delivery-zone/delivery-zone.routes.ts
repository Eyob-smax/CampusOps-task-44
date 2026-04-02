import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { idempotency } from '../../middleware/idempotency.middleware';
import {
  getZones,
  getZone,
  createZoneHandler,
  updateZoneHandler,
  addZipHandler,
  removeZipHandler,
  checkZipHandler,
} from './delivery-zone.controller';

const router = Router();

// No auth needed — used during checkout
router.get('/check/:zipCode', checkZipHandler);

router.get('/', authenticate, requirePermission('delivery-zone:read'), getZones);
router.post('/', authenticate, requirePermission('delivery-zone:write'), idempotency, createZoneHandler);
router.get('/:id', authenticate, requirePermission('delivery-zone:read'), getZone);
router.put('/:id', authenticate, requirePermission('delivery-zone:write'), idempotency, updateZoneHandler);
router.post('/:id/zips', authenticate, requirePermission('delivery-zone:write'), idempotency, addZipHandler);
router.delete('/:id/zips/:zipCode', authenticate, requirePermission('delivery-zone:write'), removeZipHandler);

export default router;
