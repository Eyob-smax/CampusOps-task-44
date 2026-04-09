import { z } from 'zod';
import { FulfillmentStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { encryptAmount, decryptAmount } from '../../lib/encryption';
import { writeAuditEntry } from '../admin/audit.service';
import { validateCoupon } from '../membership/coupon.service';
import { findTemplateForZone, calculateShippingFeeFromTemplate } from '../shipping/shipping.service';
import type { AuthenticatedUser } from '../../types';

export const createFulfillmentSchema = z.object({
  studentId: z.string().uuid(),
  items: z.array(z.object({
    description: z.string().min(1),
    quantity: z.number().int().min(1),
    unitPrice: z.number().min(0),
    weightLb: z.number().min(0).optional(),
  })).min(1),
  couponCode: z.string().optional(),
  notes: z.string().optional(),
  storedValueAmount: z.number().min(0).optional(),
  zoneId: z.string().uuid().optional(),
  tier: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export type CouponDiscountType = 'flat' | 'percent';

export function computeFulfillmentSubtotal(
  items: Array<{ quantity?: number; unitPrice?: number }>,
): number {
  return items.reduce(
    (sum, item) => sum + (item.quantity ?? 0) * (item.unitPrice ?? 0),
    0,
  );
}

export function computeFulfillmentMemberDiscount(
  subtotal: number,
  discountPercent: number,
): number {
  return subtotal * (discountPercent / 100);
}

export function computeFulfillmentCouponDiscount(
  subtotalAfterMember: number,
  discountType: CouponDiscountType,
  discountValue: number,
): number {
  if (discountType === 'flat') {
    return Math.min(discountValue, subtotalAfterMember);
  }
  return subtotalAfterMember * (discountValue / 100);
}

export function computeFulfillmentTotalDiscount(
  memberDiscount: number,
  couponDiscount: number,
  subtotal: number,
): number {
  return Math.min(memberDiscount + couponDiscount, subtotal);
}

export function computeFulfillmentTotalAmount(
  subtotal: number,
  totalDiscount: number,
  shippingFee: number,
  storedValueUsed: number,
): number {
  return Math.max(0, subtotal - totalDiscount + shippingFee - storedValueUsed);
}

export function computeFulfillmentPointsEarned(totalAmount: number): number {
  return Math.floor(totalAmount);
}

export const FULFILLMENT_VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

export function canTransitionFulfillmentStatus(from: string, to: string): boolean {
  return (FULFILLMENT_VALID_TRANSITIONS[from] ?? []).includes(to);
}

export async function listFulfillmentRequests(params: {
  studentId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}, requester?: AuthenticatedUser) {
  const where: any = {};
  if (requester?.campusId) {
    where.campusId = requester.campusId;
  }
  if (params.studentId) where.studentId = params.studentId;
  if (params.status) where.status = params.status;
  if (requester?.role === 'customer_service_agent') {
    where.createdById = requester.id;
  }
  if (params.startDate || params.endDate) {
    where.createdAt = {};
    if (params.startDate) where.createdAt.gte = new Date(params.startDate);
    if (params.endDate) where.createdAt.lte = new Date(params.endDate);
  }

  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const skip = (page - 1) * limit;

  const [total, items] = await Promise.all([
    prisma.fulfillmentRequest.count({ where }),
    prisma.fulfillmentRequest.findMany({
      where,
      include: { items: true, student: true, coupon: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
  ]);

  return { total, page, limit, items };
}

export async function getFulfillmentById(id: string, requester?: AuthenticatedUser) {
  const where: any = { id };
  if (requester?.campusId) {
    where.campusId = requester.campusId;
  }
  if (requester?.role === 'customer_service_agent') {
    where.createdById = requester.id;
  }

  const req = await prisma.fulfillmentRequest.findFirst({
    where,
    include: { items: true, student: true, coupon: true },
  });
  if (!req) {
    const err: any = new Error('Fulfillment request not found');
    err.status = 404;
    err.code = 'FULFILLMENT_NOT_FOUND';
    throw err;
  }
  return req;
}

export async function createFulfillmentRequest(
  data: z.infer<typeof createFulfillmentSchema>,
  actorId: string,
  requester?: AuthenticatedUser,
) {
  // Idempotency check
  if (data.idempotencyKey) {
    const existing = await prisma.fulfillmentRequest.findFirst({
      where: {
        idempotencyKey: data.idempotencyKey,
        ...(requester?.campusId ? { campusId: requester.campusId } : {}),
      } as any,
      include: { items: true, coupon: true },
    });
    if (existing) return existing;
  }

  // 1. Validate student
  const student = await prisma.student.findFirst({
    where: {
      id: data.studentId,
      ...(requester?.campusId ? { campusId: requester.campusId } : {}),
    } as any,
    include: { membershipTier: true },
  });
  if (!student) {
    const err: any = new Error('Student not found');
    err.status = 404;
    err.code = 'STUDENT_NOT_FOUND';
    throw err;
  }
  if ((student as any).isActive === false) {
    const err: any = new Error('Student account is inactive');
    err.status = 422;
    err.code = 'STUDENT_INACTIVE';
    throw err;
  }

  // 2. Calculate subtotal
  const subtotal = computeFulfillmentSubtotal(data.items);

  // 3. Membership tier discount
  let memberDiscount = 0;
  if (student.membershipTier) {
    memberDiscount = computeFulfillmentMemberDiscount(
      subtotal,
      Number(student.membershipTier.discountPercent),
    );
  }

  // 4. Coupon discount
  let couponId: string | undefined;
  let couponDiscount = 0;
  if (data.couponCode) {
    const subtotalAfterMember = subtotal - memberDiscount;
    const result = await validateCoupon(
      data.couponCode,
      student.membershipTierId ?? undefined,
      subtotalAfterMember,
    );
    couponDiscount = result.discountAmount;
    couponId = result.coupon.id;
  }

  // 5. Total discount capped at subtotal
  const totalDiscount = computeFulfillmentTotalDiscount(memberDiscount, couponDiscount, subtotal);

  // 6. Shipping fee
  let shippingFee = 0;
  if (data.zoneId || data.tier) {
    if (!data.zoneId || !data.tier) {
      const err: any = new Error('zoneId and tier must be provided together');
      err.status = 422;
      err.code = 'INVALID_SHIPPING_SELECTION';
      throw err;
    }

    const totalWeightLb = data.items.reduce((sum, item) => sum + (item.weightLb ?? 0), 0);
    const totalItems = data.items.reduce((sum, item) => sum + item.quantity, 0);
    const zone = await prisma.deliveryZone.findUnique({ where: { id: data.zoneId } });
    if (!zone || !zone.isActive) {
      const err: any = new Error('Invalid delivery zone');
      err.status = 422;
      err.code = 'INVALID_DELIVERY_ZONE';
      throw err;
    }

    const template = await findTemplateForZone(data.zoneId, data.tier);
    shippingFee = calculateShippingFeeFromTemplate(template, totalWeightLb, totalItems, zone.regionCode);
  }

  // 7. Stored value
  let storedValueUsed = 0;
  if (data.storedValueAmount && data.storedValueAmount > 0) {
    const currentBalanceEnc = (student as any).storedValueEncrypted;
    const currentBalance = currentBalanceEnc ? decryptAmount(currentBalanceEnc) : 0;
    if (currentBalance < data.storedValueAmount) {
      const err: any = new Error('Insufficient stored value balance');
      err.status = 422;
      err.code = 'INSUFFICIENT_BALANCE';
      throw err;
    }
    storedValueUsed = data.storedValueAmount;
  }

  // 8. Total amount
  const totalAmount = computeFulfillmentTotalAmount(
    subtotal,
    totalDiscount,
    shippingFee,
    storedValueUsed,
  );

  // 9. Points earned
  const pointsEarned = computeFulfillmentPointsEarned(totalAmount);

  // 10. Receipt number
  const receiptNumber = `RCP-${Date.now().toString(36).toUpperCase()}`;

  const fulfillmentRequest = await prisma.$transaction(async (tx) => {
    // Create fulfillment request
    const fr = await tx.fulfillmentRequest.create({
      data: {
        campusId: (student as any).campusId ?? requester?.campusId ?? 'main-campus',
        studentId: data.studentId,
        createdById: actorId,
        status: 'pending',
        couponId: couponId ?? null,
        subtotal,
        discountAmount: totalDiscount,
        shippingFee,
        totalAmount,
        storedValueUsed,
        pointsEarned,
        receiptNumber,
        notes: data.notes,
        idempotencyKey: data.idempotencyKey,
        items: {
          create: data.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            weightLb: item.weightLb,
          })),
        },
      },
      include: { items: true, coupon: true },
    });

    // Increment coupon usage
    if (couponId) {
      await tx.coupon.update({
        where: { id: couponId },
        data: { usageCount: { increment: 1 } },
      });
    }

    // Deduct stored value
    if (storedValueUsed > 0) {
      const latestStudent = await tx.student.findUnique({
        where: { id: data.studentId },
        select: {
          id: true,
          campusId: true,
          storedValueEncrypted: true,
        },
      });

      if (
        !latestStudent ||
        (requester?.campusId && latestStudent.campusId !== requester.campusId)
      ) {
        const err: any = new Error('Student not found');
        err.status = 404;
        err.code = 'STUDENT_NOT_FOUND';
        throw err;
      }

      const currentBalanceEnc = latestStudent.storedValueEncrypted ?? null;
      const currentBalance = currentBalanceEnc
        ? decryptAmount(currentBalanceEnc)
        : 0;

      if (currentBalance < storedValueUsed) {
        const err: any = new Error('Insufficient stored value balance');
        err.status = 422;
        err.code = 'INSUFFICIENT_BALANCE';
        throw err;
      }

      const newBalance = currentBalance - storedValueUsed;

      const updateResult = await tx.student.updateMany({
        where: {
          id: data.studentId,
          campusId: latestStudent.campusId,
          storedValueEncrypted: currentBalanceEnc,
        },
        data: { storedValueEncrypted: encryptAmount(newBalance) },
      });

      if (updateResult.count !== 1) {
        const err: any = new Error('Stored value balance changed during checkout');
        err.status = 409;
        err.code = 'BALANCE_CONFLICT';
        throw err;
      }

      await tx.storedValueTransaction.create({
        data: {
          studentId: data.studentId,
          type: 'spend',
          amountEncrypted: encryptAmount(storedValueUsed),
          balanceAfterEncrypted: encryptAmount(newBalance),
          referenceId: fr.id,
          referenceType: 'fulfillment',
        },
      });
    }

    // Increment growth points
    if (pointsEarned > 0) {
      await tx.student.update({
        where: { id: data.studentId },
        data: { growthPoints: { increment: pointsEarned } },
      });
    }

    return fr;
  });

  await writeAuditEntry(
    actorId,
    'fulfillment.create',
    'FulfillmentRequest',
    fulfillmentRequest.id,
    { receiptNumber, totalAmount, pointsEarned },
  );

  return fulfillmentRequest;
}

export async function updateFulfillmentStatus(
  id: string,
  status: string,
  actorId: string,
  requester?: AuthenticatedUser,
) {
  const fr = await getFulfillmentById(id, requester);
  if (!canTransitionFulfillmentStatus(fr.status, status)) {
    const err: any = new Error(`Cannot transition from ${fr.status} to ${status}`);
    err.status = 422;
    err.code = 'INVALID_STATUS_TRANSITION';
    throw err;
  }

  const updated = await prisma.fulfillmentRequest.update({
    where: { id },
    data: { status: status as FulfillmentStatus },
    include: { items: true, coupon: true },
  });

  await writeAuditEntry(
    actorId,
    'fulfillment.statusUpdate',
    'FulfillmentRequest',
    id,
    { from: fr.status, to: status },
  );

  return updated;
}

export async function cancelFulfillment(id: string, actorId: string, requester?: AuthenticatedUser) {
  return updateFulfillmentStatus(id, 'cancelled', actorId, requester);
}
