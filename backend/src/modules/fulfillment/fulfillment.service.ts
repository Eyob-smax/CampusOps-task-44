import { z } from 'zod';
import { FulfillmentStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { encryptAmount, decryptAmount } from '../../lib/encryption';
import { writeAuditEntry } from '../admin/audit.service';
import { validateCoupon } from '../membership/coupon.service';
import { findTemplateForZone, calculateShippingFeeFromTemplate } from '../shipping/shipping.service';

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

export async function listFulfillmentRequests(params: {
  studentId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}) {
  const where: any = {};
  if (params.studentId) where.studentId = params.studentId;
  if (params.status) where.status = params.status;
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

export async function getFulfillmentById(id: string) {
  const req = await prisma.fulfillmentRequest.findUnique({
    where: { id },
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
) {
  // Idempotency check
  if (data.idempotencyKey) {
    const existing = await prisma.fulfillmentRequest.findFirst({
      where: { idempotencyKey: data.idempotencyKey },
      include: { items: true, coupon: true },
    });
    if (existing) return existing;
  }

  // 1. Validate student
  const student = await prisma.student.findUnique({
    where: { id: data.studentId },
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
  const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  // 3. Membership tier discount
  let memberDiscount = 0;
  if (student.membershipTier) {
    memberDiscount = subtotal * (Number(student.membershipTier.discountPercent) / 100);
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
  const totalDiscount = Math.min(memberDiscount + couponDiscount, subtotal);

  // 6. Shipping fee
  let shippingFee = 0;
  if (data.zoneId && data.tier) {
    const totalWeightLb = data.items.reduce((sum, item) => sum + (item.weightLb ?? 0), 0);
    const totalItems = data.items.reduce((sum, item) => sum + item.quantity, 0);
    const zone = await prisma.deliveryZone.findUnique({ where: { id: data.zoneId } });
    if (zone) {
      const template = await findTemplateForZone(data.zoneId, data.tier);
      shippingFee = calculateShippingFeeFromTemplate(template, totalWeightLb, totalItems, zone.regionCode);
    }
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
  const totalAmount = Math.max(0, subtotal - totalDiscount + shippingFee - storedValueUsed);

  // 9. Points earned
  const pointsEarned = Math.floor(totalAmount);

  // 10. Receipt number
  const receiptNumber = `RCP-${Date.now().toString(36).toUpperCase()}`;

  const fulfillmentRequest = await prisma.$transaction(async (tx) => {
    // Create fulfillment request
    const fr = await tx.fulfillmentRequest.create({
      data: {
        studentId: data.studentId,
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
      const currentBalanceEnc = (student as any).storedValueEncrypted;
      const currentBalance = currentBalanceEnc ? decryptAmount(currentBalanceEnc) : 0;
      const newBalance = currentBalance - storedValueUsed;
      await tx.student.update({
        where: { id: data.studentId },
        data: { storedValueEncrypted: encryptAmount(newBalance) },
      });
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

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['pending', 'cancelled'],
  pending: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

export async function updateFulfillmentStatus(id: string, status: string, actorId: string) {
  const fr = await getFulfillmentById(id);
  const allowed = VALID_TRANSITIONS[fr.status] ?? [];
  if (!allowed.includes(status)) {
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

export async function cancelFulfillment(id: string, actorId: string) {
  return updateFulfillmentStatus(id, 'cancelled', actorId);
}
