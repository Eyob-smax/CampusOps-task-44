import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { idempotency } from '../../middleware/idempotency.middleware';
import {
  getTemplates,
  getTemplate,
  createTemplateHandler,
  updateTemplateHandler,
  calculateFeeHandler,
} from './shipping.controller';

const router = Router();

router.post('/calculate', authenticate, calculateFeeHandler);
router.get('/', authenticate, requirePermission('shipping-template:read'), getTemplates);
router.post('/', authenticate, requirePermission('shipping-template:write'), idempotency, createTemplateHandler);
router.get('/:id', authenticate, requirePermission('shipping-template:read'), getTemplate);
router.put('/:id', authenticate, requirePermission('shipping-template:write'), idempotency, updateTemplateHandler);

export default router;
