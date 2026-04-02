import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { idempotency } from '../../middleware/idempotency.middleware';
import {
  getWarehouses,
  getWarehouse,
  createWarehouseHandler,
  updateWarehouseHandler,
} from './warehouse.controller';

const router = Router();

router.get('/', authenticate, requirePermission('warehouse:read'), getWarehouses);
router.post('/', authenticate, requirePermission('warehouse:write'), idempotency, createWarehouseHandler);
router.get('/:id', authenticate, requirePermission('warehouse:read'), getWarehouse);
router.put('/:id', authenticate, requirePermission('warehouse:write'), idempotency, updateWarehouseHandler);

export default router;
