import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { idempotency } from '../../middleware/idempotency.middleware';
import {
  getCoupons,
  getCoupon,
  createCouponHandler,
  updateCouponHandler,
  validateCouponHandler,
} from './coupon.controller';

const router = Router();

router.post('/validate', authenticate, requirePermission('coupon:read'), validateCouponHandler);
router.get('/', authenticate, requirePermission('coupon:read'), getCoupons);
router.post('/', authenticate, requirePermission('coupon:write'), idempotency, createCouponHandler);
router.get('/:id', authenticate, requirePermission('coupon:read'), getCoupon);
router.put('/:id', authenticate, requirePermission('coupon:write'), idempotency, updateCouponHandler);

export default router;
