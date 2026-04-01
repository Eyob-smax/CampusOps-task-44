import { Request, Response, NextFunction } from 'express';
import {
  listCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  validateCoupon,
  createCouponSchema,
  updateCouponSchema,
} from './coupon.service';
import { z } from 'zod';

const validateSchema = z.object({
  code: z.string().min(1),
  studentTierId: z.string().uuid().optional(),
  orderSubtotal: z.number().min(0),
});

export async function getCoupons(req: Request, res: Response, next: NextFunction) {
  try { res.json(await listCoupons()); } catch (err) { next(err); }
}

export async function getCoupon(req: Request, res: Response, next: NextFunction) {
  try { res.json(await getCouponById(req.params.id)); } catch (err) { next(err); }
}

export async function createCouponHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createCouponSchema.parse(req.body);
    res.status(201).json(await createCoupon(body));
  } catch (err) { next(err); }
}

export async function updateCouponHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = updateCouponSchema.parse(req.body);
    res.json(await updateCoupon(req.params.id, body));
  } catch (err) { next(err); }
}

export async function validateCouponHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = validateSchema.parse(req.body);
    res.json(await validateCoupon(body.code, body.studentTierId, body.orderSubtotal));
  } catch (err) { next(err); }
}
