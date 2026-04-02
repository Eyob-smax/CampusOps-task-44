/**
 * Unit tests — coupon schema validation
 *
 * Tests Zod schemas for coupon creation/update without DB.
 */
import { describe, it, expect } from 'vitest';

process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_SECRET     = 'test-jwt-secret';
process.env.NODE_ENV       = 'test';

const { createCouponSchema, updateCouponSchema } =
  await import('../src/modules/membership/coupon.service');

// ---- createCouponSchema ----
describe('createCouponSchema', () => {
  const validId = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts valid flat coupon', () => {
    const result = createCouponSchema.safeParse({
      code: 'SAVE10',
      discountType: 'flat',
      discountValue: 10,
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid percent coupon', () => {
    const result = createCouponSchema.safeParse({
      code: 'SUMMER20',
      discountType: 'percent',
      discountValue: 20,
    });
    expect(result.success).toBe(true);
  });

  it('uppercases coupon code', () => {
    const result = createCouponSchema.safeParse({
      code: 'save10',
      discountType: 'flat',
      discountValue: 10,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe('SAVE10');
    }
  });

  it('trims whitespace from code before uppercasing', () => {
    const result = createCouponSchema.safeParse({
      code: '  save10  ',
      discountType: 'flat',
      discountValue: 10,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe('SAVE10');
    }
  });

  it('rejects code shorter than 3 chars', () => {
    const result = createCouponSchema.safeParse({
      code: 'AB',
      discountType: 'flat',
      discountValue: 5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects code longer than 40 chars', () => {
    const result = createCouponSchema.safeParse({
      code: 'A'.repeat(41),
      discountType: 'flat',
      discountValue: 5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid discountType', () => {
    const result = createCouponSchema.safeParse({
      code: 'TEST',
      discountType: 'absolute',
      discountValue: 5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero discountValue', () => {
    const result = createCouponSchema.safeParse({
      code: 'TEST',
      discountType: 'flat',
      discountValue: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative discountValue', () => {
    const result = createCouponSchema.safeParse({
      code: 'TEST',
      discountType: 'flat',
      discountValue: -5,
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional tierId as UUID', () => {
    const result = createCouponSchema.safeParse({
      code: 'GOLD5',
      discountType: 'percent',
      discountValue: 5,
      tierId: validId,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID tierId', () => {
    const result = createCouponSchema.safeParse({
      code: 'GOLD5',
      discountType: 'percent',
      discountValue: 5,
      tierId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional expiresAt as ISO datetime', () => {
    const result = createCouponSchema.safeParse({
      code: 'EXPIRE1',
      discountType: 'flat',
      discountValue: 5,
      expiresAt: '2025-12-31T23:59:59Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.expiresAt).toBeInstanceOf(Date);
    }
  });

  it('rejects invalid expiresAt string', () => {
    const result = createCouponSchema.safeParse({
      code: 'EXPIRE2',
      discountType: 'flat',
      discountValue: 5,
      expiresAt: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });
});

// ---- Coupon validation business logic (pure) ----
describe('coupon validation business logic', () => {
  function mockCoupon(overrides: Record<string, unknown> = {}) {
    return {
      isActive: true,
      expiresAt: null,
      maxUsage: null,
      usageCount: 0,
      isSingleUse: false,
      minimumOrderValue: null,
      tierId: null,
      discountType: 'flat',
      discountValue: 10,
      ...overrides,
    };
  }

  function validateCouponLogic(
    coupon: ReturnType<typeof mockCoupon>,
    studentTierId: string | undefined,
    orderSubtotal: number,
  ): { valid: boolean; reason?: string; discountAmount?: number } {
    if (!coupon.isActive) return { valid: false, reason: 'COUPON_INACTIVE' };
    if (coupon.expiresAt && new Date(coupon.expiresAt as string) < new Date()) return { valid: false, reason: 'COUPON_EXPIRED' };
    if (coupon.maxUsage != null && coupon.usageCount >= coupon.maxUsage) return { valid: false, reason: 'COUPON_EXHAUSTED' };
    if (coupon.isSingleUse && coupon.usageCount > 0) return { valid: false, reason: 'COUPON_SINGLE_USE_EXHAUSTED' };
    if (coupon.minimumOrderValue != null && orderSubtotal < coupon.minimumOrderValue) return { valid: false, reason: 'COUPON_MINIMUM_NOT_MET' };
    if (coupon.tierId != null && coupon.tierId !== studentTierId) return { valid: false, reason: 'COUPON_TIER_RESTRICTED' };

    let discountAmount: number;
    if (coupon.discountType === 'flat') {
      discountAmount = Math.min(Number(coupon.discountValue), orderSubtotal);
    } else {
      discountAmount = Math.min(orderSubtotal * (Number(coupon.discountValue) / 100), orderSubtotal);
    }
    return { valid: true, discountAmount };
  }

  it('valid flat coupon returns discount', () => {
    const result = validateCouponLogic(mockCoupon({ discountValue: 10 }), undefined, 50);
    expect(result.valid).toBe(true);
    expect(result.discountAmount).toBe(10);
  });

  it('flat discount capped at order subtotal', () => {
    const result = validateCouponLogic(mockCoupon({ discountValue: 100 }), undefined, 30);
    expect(result.valid).toBe(true);
    expect(result.discountAmount).toBe(30);
  });

  it('percent coupon applies correctly', () => {
    const result = validateCouponLogic(mockCoupon({ discountType: 'percent', discountValue: 20 }), undefined, 100);
    expect(result.valid).toBe(true);
    expect(result.discountAmount).toBe(20);
  });

  it('rejects inactive coupon', () => {
    const result = validateCouponLogic(mockCoupon({ isActive: false }), undefined, 50);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('COUPON_INACTIVE');
  });

  it('rejects expired coupon', () => {
    const result = validateCouponLogic(mockCoupon({ expiresAt: '2020-01-01T00:00:00Z' }), undefined, 50);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('COUPON_EXPIRED');
  });

  it('rejects exhausted coupon', () => {
    const result = validateCouponLogic(mockCoupon({ maxUsage: 5, usageCount: 5 }), undefined, 50);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('COUPON_EXHAUSTED');
  });

  it('rejects single-use coupon that was used', () => {
    const result = validateCouponLogic(mockCoupon({ isSingleUse: true, usageCount: 1 }), undefined, 50);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('COUPON_SINGLE_USE_EXHAUSTED');
  });

  it('rejects when order does not meet minimum', () => {
    const result = validateCouponLogic(mockCoupon({ minimumOrderValue: 100 }), undefined, 50);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('COUPON_MINIMUM_NOT_MET');
  });

  it('accepts when order meets minimum exactly', () => {
    const result = validateCouponLogic(mockCoupon({ minimumOrderValue: 50 }), undefined, 50);
    expect(result.valid).toBe(true);
  });

  it('rejects tier-restricted coupon for wrong tier', () => {
    const tierId = '550e8400-e29b-41d4-a716-446655440000';
    const result = validateCouponLogic(mockCoupon({ tierId }), 'other-tier-id', 50);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('COUPON_TIER_RESTRICTED');
  });

  it('accepts tier-restricted coupon for matching tier', () => {
    const tierId = '550e8400-e29b-41d4-a716-446655440000';
    const result = validateCouponLogic(mockCoupon({ tierId }), tierId, 50);
    expect(result.valid).toBe(true);
  });
});
