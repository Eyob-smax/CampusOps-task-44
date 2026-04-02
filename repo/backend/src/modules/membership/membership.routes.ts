import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { idempotency } from '../../middleware/idempotency.middleware';
import {
  getTiers,
  getTier,
  createTierHandler,
  updateTierHandler,
} from './membership.controller';

const router = Router();

router.get('/', authenticate, requirePermission('membership:read'), getTiers);
router.post('/', authenticate, requirePermission('membership:write'), idempotency, createTierHandler);
router.get('/:id', authenticate, requirePermission('membership:read'), getTier);
router.put('/:id', authenticate, requirePermission('membership:write'), idempotency, updateTierHandler);

export default router;
