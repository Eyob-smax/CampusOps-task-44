import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export const createCouponSchema = z.object({
  code: z.string().min(3).max(40).trim().transform((v) => v.toUpperCase()),
  discountType: z.enum(['flat', 'percent']),
  discountValue: z.number().positive(),
  minimumOrderValue: z.number().min(0).optional(),
  tierId: z.string().uuid().optional(),
  isSingleUse: z.boolean().optional(),
  maxUsage: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional().transform((v) => (v ? new Date(v) : undefined)),
});

export const updateCouponSchema = z.object({
  code: z.string().min(3).max(40).trim().transform((v) => v.toUpperCase()).optional(),
  discountType: z.enum(['flat', 'percent']).optional(),
  discountValue: z.number().positive().optional(),
  minimumOrderValue: z.number().min(0).optional(),
  tierId: z.string().uuid().optional().nullable(),
  isSingleUse: z.boolean().optional(),
  maxUsage: z.number().int().positive().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable().transform((v) => (v ? new Date(v) : v)),
  isActive: z.boolean().optional(),
});

function throwCouponError(status: number, code: string, message: string): never {
  const err: any = new Error(message);
  err.status = status;
  err.code = code;
  throw err;
}

export async function listCoupons() {
  return prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function getCouponById(id: string) {
  const coupon = await prisma.coupon.findUnique({ where: { id } });
  if (!coupon) throwCouponError(404, 'COUPON_NOT_FOUND', 'Coupon not found');
  return coupon!;
}

export async function createCoupon(data: z.infer<typeof createCouponSchema>) {
  const parsed = createCouponSchema.parse(data);
  const createData: Prisma.CouponCreateInput = {
    code: parsed.code,
    discountType: parsed.discountType,
    discountValue: parsed.discountValue,
    ...(parsed.minimumOrderValue !== undefined
      ? { minimumOrderValue: parsed.minimumOrderValue }
      : {}),
    ...(parsed.isSingleUse !== undefined ? { isSingleUse: parsed.isSingleUse } : {}),
    ...(parsed.maxUsage !== undefined ? { maxUsage: parsed.maxUsage } : {}),
    ...(parsed.expiresAt !== undefined ? { expiresAt: parsed.expiresAt } : {}),
    ...(parsed.tierId !== undefined ? { tier: { connect: { id: parsed.tierId } } } : {}),
  };

  return prisma.coupon.create({ data: createData });
}

export async function updateCoupon(id: string, data: z.infer<typeof updateCouponSchema>) {
  await getCouponById(id);
  const parsed = updateCouponSchema.parse(data);
  const updateData: Prisma.CouponUpdateInput = {
    ...(parsed.code !== undefined ? { code: parsed.code } : {}),
    ...(parsed.discountType !== undefined ? { discountType: parsed.discountType } : {}),
    ...(parsed.discountValue !== undefined ? { discountValue: parsed.discountValue } : {}),
    ...(parsed.minimumOrderValue !== undefined
      ? { minimumOrderValue: parsed.minimumOrderValue }
      : {}),
    ...(parsed.isSingleUse !== undefined ? { isSingleUse: parsed.isSingleUse } : {}),
    ...(parsed.maxUsage !== undefined ? { maxUsage: parsed.maxUsage } : {}),
    ...(parsed.expiresAt !== undefined ? { expiresAt: parsed.expiresAt } : {}),
    ...(parsed.isActive !== undefined ? { isActive: parsed.isActive } : {}),
    ...(parsed.tierId !== undefined
      ? parsed.tierId === null
        ? { tier: { disconnect: true } }
        : { tier: { connect: { id: parsed.tierId } } }
      : {}),
  };

  return prisma.coupon.update({ where: { id }, data: updateData });
}

export async function validateCoupon(
  code: string,
  studentTierId: string | undefined,
  orderSubtotal: number,
): Promise<{ coupon: any; discountAmount: number }> {
  const coupon = await prisma.coupon.findFirst({ where: { code: code.toUpperCase() } });
  if (!coupon) throwCouponError(404, 'COUPON_NOT_FOUND', 'Coupon not found');

  if (!coupon!.isActive) throwCouponError(422, 'COUPON_INACTIVE', 'Coupon is inactive');
  if (coupon!.expiresAt && coupon!.expiresAt < new Date()) {
    throwCouponError(422, 'COUPON_EXPIRED', 'Coupon has expired');
  }
  if (coupon!.maxUsage != null && coupon!.usageCount >= coupon!.maxUsage) {
    throwCouponError(422, 'COUPON_EXHAUSTED', 'Coupon usage limit reached');
  }
  if (coupon!.isSingleUse && coupon!.usageCount > 0) {
    throwCouponError(422, 'COUPON_SINGLE_USE_EXHAUSTED', 'Single-use coupon already used');
  }
  if (coupon!.minimumOrderValue != null && orderSubtotal < Number(coupon!.minimumOrderValue)) {
    throwCouponError(422, 'COUPON_MINIMUM_NOT_MET', 'Order does not meet minimum value');
  }
  if (coupon!.tierId != null && coupon!.tierId !== studentTierId) {
    throwCouponError(422, 'COUPON_TIER_RESTRICTED', 'Coupon is restricted to a specific membership tier');
  }

  let calculated: number;
  if (coupon!.discountType === 'flat') {
    calculated = Number(coupon!.discountValue);
  } else {
    calculated = orderSubtotal * (Number(coupon!.discountValue) / 100);
  }

  const discountAmount = Math.min(calculated, orderSubtotal);
  return { coupon: coupon!, discountAmount };
}
