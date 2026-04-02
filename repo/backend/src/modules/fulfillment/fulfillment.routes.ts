import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { idempotencyMiddleware } from '../../middleware/idempotency.middleware';
import {
  listFulfillments,
  getFulfillment,
  createFulfillmentHandler,
  updateStatusHandler,
  cancelFulfillmentHandler,
} from './fulfillment.controller';

const router = Router();

router.get('/', authenticate, requirePermission('fulfillment:read'), listFulfillments);
router.post('/', authenticate, requirePermission('fulfillment:create'), idempotencyMiddleware, createFulfillmentHandler);
router.get('/:id', authenticate, requirePermission('fulfillment:read'), getFulfillment);
router.patch('/:id/status', authenticate, requirePermission('fulfillment:manage'), updateStatusHandler);
router.patch('/:id/cancel', authenticate, requirePermission('fulfillment:manage'), cancelFulfillmentHandler);

export default router;
