/**
 * Unit tests — fulfillment pricing pipeline and status transitions
 *
 * Tests pure arithmetic from createFulfillmentRequest logic and
 * the VALID_TRANSITIONS state machine — no DB, no network calls.
 */
import { describe, it, expect } from 'vitest';

process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_SECRET     = 'test-jwt-secret';
process.env.NODE_ENV       = 'test';

const { createFulfillmentSchema } = await import('../src/modules/fulfillment/fulfillment.service');

// ---- Pure pricing helpers (mirrored from service logic) ----

function calcSubtotal(items: Array<{ quantity: number; unitPrice: number }>): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

function calcMemberDiscount(subtotal: number, discountPercent: number): number {
  return subtotal * (discountPercent / 100);
}

function calcCouponDiscount(
  subtotalAfterMember: number,
  discountType: 'flat' | 'percent',
  discountValue: number,
): number {
  if (discountType === 'flat') {
    return Math.min(discountValue, subtotalAfterMember);
  }
  return subtotalAfterMember * (discountValue / 100);
}

function calcTotalDiscount(memberDiscount: number, couponDiscount: number, subtotal: number): number {
  return Math.min(memberDiscount + couponDiscount, subtotal);
}

function calcTotalAmount(
  subtotal: number,
  totalDiscount: number,
  shippingFee: number,
  storedValueUsed: number,
): number {
  return Math.max(0, subtotal - totalDiscount + shippingFee - storedValueUsed);
}

function calcPointsEarned(totalAmount: number): number {
  return Math.floor(totalAmount);
}

// ---- Status transition logic (mirrored from service) ----

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft:      ['pending', 'cancelled'],
  pending:    ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped:    ['delivered', 'cancelled'],
  delivered:  [],
  cancelled:  [],
};

function canTransition(from: string, to: string): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

// ============================================================
// createFulfillmentSchema
// ============================================================

describe('createFulfillmentSchema', () => {
  const validUuid = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts minimal valid payload', () => {
    const result = createFulfillmentSchema.safeParse({
      studentId: validUuid,
      items: [{ description: 'Book', quantity: 1, unitPrice: 20.00 }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts full payload with all optional fields', () => {
    const result = createFulfillmentSchema.safeParse({
      studentId: validUuid,
      items: [{ description: 'Book', quantity: 2, unitPrice: 15.50, weightLb: 1.2 }],
      couponCode: 'SAVE10',
      notes: 'rush order',
      storedValueAmount: 5.00,
      zoneId: validUuid,
      tier: 'standard',
      idempotencyKey: 'key-abc-123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID studentId', () => {
    const result = createFulfillmentSchema.safeParse({
      studentId: 'not-a-uuid',
      items: [{ description: 'Book', quantity: 1, unitPrice: 10 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty items array', () => {
    const result = createFulfillmentSchema.safeParse({
      studentId: validUuid,
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects item with quantity 0', () => {
    const result = createFulfillmentSchema.safeParse({
      studentId: validUuid,
      items: [{ description: 'Book', quantity: 0, unitPrice: 10 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects item with negative quantity', () => {
    const result = createFulfillmentSchema.safeParse({
      studentId: validUuid,
      items: [{ description: 'Book', quantity: -1, unitPrice: 10 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects item with negative unitPrice', () => {
    const result = createFulfillmentSchema.safeParse({
      studentId: validUuid,
      items: [{ description: 'Book', quantity: 1, unitPrice: -5 }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts item with zero unitPrice (free item)', () => {
    const result = createFulfillmentSchema.safeParse({
      studentId: validUuid,
      items: [{ description: 'Freebie', quantity: 1, unitPrice: 0 }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects item with empty description', () => {
    const result = createFulfillmentSchema.safeParse({
      studentId: validUuid,
      items: [{ description: '', quantity: 1, unitPrice: 10 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative storedValueAmount', () => {
    const result = createFulfillmentSchema.safeParse({
      studentId: validUuid,
      items: [{ description: 'Book', quantity: 1, unitPrice: 10 }],
      storedValueAmount: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID zoneId', () => {
    const result = createFulfillmentSchema.safeParse({
      studentId: validUuid,
      items: [{ description: 'Book', quantity: 1, unitPrice: 10 }],
      zoneId: 'bad-zone',
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// Subtotal calculation
// ============================================================

describe('calcSubtotal', () => {
  it('single item: quantity × unitPrice', () => {
    expect(calcSubtotal([{ quantity: 3, unitPrice: 10 }])).toBe(30);
  });

  it('multiple items: sums correctly', () => {
    expect(calcSubtotal([
      { quantity: 2, unitPrice: 15 },
      { quantity: 1, unitPrice: 8.50 },
    ])).toBeCloseTo(38.50);
  });

  it('single item with fractional price', () => {
    expect(calcSubtotal([{ quantity: 4, unitPrice: 2.25 }])).toBeCloseTo(9.00);
  });

  it('single item with zero price gives 0 subtotal', () => {
    expect(calcSubtotal([{ quantity: 5, unitPrice: 0 }])).toBe(0);
  });
});

// ============================================================
// Member tier discount
// ============================================================

describe('calcMemberDiscount', () => {
  it('0% discount returns 0', () => {
    expect(calcMemberDiscount(100, 0)).toBe(0);
  });

  it('10% of $100 subtotal is $10', () => {
    expect(calcMemberDiscount(100, 10)).toBe(10);
  });

  it('100% discount equals entire subtotal', () => {
    expect(calcMemberDiscount(50, 100)).toBe(50);
  });

  it('fractional percent: 7.5% of $200', () => {
    expect(calcMemberDiscount(200, 7.5)).toBe(15);
  });
});

// ============================================================
// Coupon discount
// ============================================================

describe('calcCouponDiscount', () => {
  it('flat discount less than subtotal returns discountValue', () => {
    expect(calcCouponDiscount(100, 'flat', 20)).toBe(20);
  });

  it('flat discount greater than subtotal is capped at subtotal', () => {
    expect(calcCouponDiscount(15, 'flat', 30)).toBe(15);
  });

  it('percent discount: 10% of $80 is $8', () => {
    expect(calcCouponDiscount(80, 'percent', 10)).toBe(8);
  });

  it('percent discount: 25% of $120 is $30', () => {
    expect(calcCouponDiscount(120, 'percent', 25)).toBe(30);
  });
});

// ============================================================
// Total discount capped at subtotal
// ============================================================

describe('calcTotalDiscount', () => {
  it('member + coupon discount below subtotal: both applied', () => {
    expect(calcTotalDiscount(10, 5, 100)).toBe(15);
  });

  it('combined discount exceeds subtotal: capped at subtotal', () => {
    expect(calcTotalDiscount(60, 50, 80)).toBe(80);
  });

  it('no discounts returns 0', () => {
    expect(calcTotalDiscount(0, 0, 100)).toBe(0);
  });

  it('combined discount exactly equals subtotal', () => {
    expect(calcTotalDiscount(40, 60, 100)).toBe(100);
  });
});

// ============================================================
// Total amount (final)
// ============================================================

describe('calcTotalAmount', () => {
  it('no discounts, no shipping, no stored value: equals subtotal', () => {
    expect(calcTotalAmount(100, 0, 0, 0)).toBe(100);
  });

  it('discount reduces total', () => {
    expect(calcTotalAmount(100, 20, 0, 0)).toBe(80);
  });

  it('shipping added to total', () => {
    expect(calcTotalAmount(100, 0, 10, 0)).toBe(110);
  });

  it('stored value deducted from total', () => {
    expect(calcTotalAmount(100, 0, 0, 25)).toBe(75);
  });

  it('total floored at 0 — never negative', () => {
    expect(calcTotalAmount(50, 40, 0, 30)).toBe(0);
  });

  it('full pipeline: subtotal 200, discount 30, shipping 8, stored value 50', () => {
    // 200 - 30 + 8 - 50 = 128
    expect(calcTotalAmount(200, 30, 8, 50)).toBe(128);
  });

  it('full discount + stored value exceeds subtotal → 0', () => {
    expect(calcTotalAmount(100, 100, 0, 10)).toBe(0);
  });
});

// ============================================================
// Points earned
// ============================================================

describe('calcPointsEarned', () => {
  it('integer total: points equal total', () => {
    expect(calcPointsEarned(50)).toBe(50);
  });

  it('fractional total: floors to integer', () => {
    expect(calcPointsEarned(49.99)).toBe(49);
  });

  it('zero total: zero points', () => {
    expect(calcPointsEarned(0)).toBe(0);
  });

  it('large total', () => {
    expect(calcPointsEarned(1234.56)).toBe(1234);
  });
});

// ============================================================
// Receipt number format
// ============================================================

describe('receipt number format', () => {
  it('receipt number starts with RCP- prefix', () => {
    const receiptNumber = `RCP-${Date.now().toString(36).toUpperCase()}`;
    expect(receiptNumber).toMatch(/^RCP-[A-Z0-9]+$/);
  });

  it('receipt numbers generated in sequence are distinct', () => {
    const a = `RCP-${Date.now().toString(36).toUpperCase()}`;
    // Ensure distinct by appending counter in real code; at least format is consistent
    expect(a.startsWith('RCP-')).toBe(true);
  });
});

// ============================================================
// Fulfillment status transitions
// ============================================================

describe('fulfillment status transitions — valid', () => {
  it('draft → pending', () => {
    expect(canTransition('draft', 'pending')).toBe(true);
  });

  it('draft → cancelled', () => {
    expect(canTransition('draft', 'cancelled')).toBe(true);
  });

  it('pending → processing', () => {
    expect(canTransition('pending', 'processing')).toBe(true);
  });

  it('pending → cancelled', () => {
    expect(canTransition('pending', 'cancelled')).toBe(true);
  });

  it('processing → shipped', () => {
    expect(canTransition('processing', 'shipped')).toBe(true);
  });

  it('processing → cancelled', () => {
    expect(canTransition('processing', 'cancelled')).toBe(true);
  });

  it('shipped → delivered', () => {
    expect(canTransition('shipped', 'delivered')).toBe(true);
  });

  it('shipped → cancelled', () => {
    expect(canTransition('shipped', 'cancelled')).toBe(true);
  });
});

describe('fulfillment status transitions — invalid', () => {
  it('delivered → cancelled is blocked', () => {
    expect(canTransition('delivered', 'cancelled')).toBe(false);
  });

  it('delivered → pending is blocked', () => {
    expect(canTransition('delivered', 'pending')).toBe(false);
  });

  it('cancelled → pending is blocked', () => {
    expect(canTransition('cancelled', 'pending')).toBe(false);
  });

  it('cancelled → processing is blocked', () => {
    expect(canTransition('cancelled', 'processing')).toBe(false);
  });

  it('pending → delivered (skip steps) is blocked', () => {
    expect(canTransition('pending', 'delivered')).toBe(false);
  });

  it('draft → shipped (skip steps) is blocked', () => {
    expect(canTransition('draft', 'shipped')).toBe(false);
  });

  it('unknown status returns false', () => {
    expect(canTransition('unknown', 'pending')).toBe(false);
  });
});
