/**
 * Unit tests — shipping fee calculation logic
 *
 * Tests the pure fee calculation function without DB.
 */
import { describe, it, expect } from 'vitest';

process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_SECRET     = 'test-jwt-secret';
process.env.NODE_ENV       = 'test';

const { calculateShippingFeeFromTemplate, createTemplateSchema } =
  await import('../src/modules/shipping/shipping.service');

// ---- calculateShippingFeeFromTemplate ----
describe('calculateShippingFeeFromTemplate', () => {
  const baseTemplate = {
    baseFee: 5.00,
    baseWeightLb: 2,
    perLbFee: 0.50,
    maxItems: null,
    perItemFee: null,
    surchargeAk: 10.00,
    surchargeHi: 8.00,
  };

  it('returns base fee when weight is within base weight', () => {
    const fee = calculateShippingFeeFromTemplate(baseTemplate, 1, 1, 'US');
    expect(fee).toBe(5.00);
  });

  it('returns base fee when weight equals base weight exactly', () => {
    const fee = calculateShippingFeeFromTemplate(baseTemplate, 2, 1, 'US');
    expect(fee).toBe(5.00);
  });

  it('adds per-lb charge for weight over base', () => {
    // 3 lb total, base 2 lb → extra 1 lb × $0.50 = $0.50
    const fee = calculateShippingFeeFromTemplate(baseTemplate, 3, 1, 'US');
    expect(fee).toBe(5.50);
  });

  it('adds per-lb charge for 5 extra lbs', () => {
    // 7 lb total, base 2 → extra 5 × $0.50 = $2.50
    const fee = calculateShippingFeeFromTemplate(baseTemplate, 7, 1, 'US');
    expect(fee).toBe(7.50);
  });

  it('adds AK surcharge for AK region', () => {
    const fee = calculateShippingFeeFromTemplate(baseTemplate, 1, 1, 'AK');
    expect(fee).toBe(15.00); // $5 base + $10 AK
  });

  it('adds HI surcharge for HI region', () => {
    const fee = calculateShippingFeeFromTemplate(baseTemplate, 1, 1, 'HI');
    expect(fee).toBe(13.00); // $5 base + $8 HI
  });

  it('does NOT add AK surcharge for non-AK region', () => {
    const fee = calculateShippingFeeFromTemplate(baseTemplate, 1, 1, 'CA');
    expect(fee).toBe(5.00);
  });

  it('combines weight overage + AK surcharge', () => {
    // 4 lb, base 2 → 2 extra × $0.50 = $1.00; + $10 AK = $16.00
    const fee = calculateShippingFeeFromTemplate(baseTemplate, 4, 1, 'AK');
    expect(fee).toBe(16.00);
  });
});

describe('calculateShippingFeeFromTemplate — per-item fees', () => {
  const templateWithItemFee = {
    baseFee: 3.00,
    baseWeightLb: 0,
    perLbFee: 0,
    maxItems: 5,
    perItemFee: 1.00,
    surchargeAk: 0,
    surchargeHi: 0,
  };

  it('adds per-item fee for each item', () => {
    const fee = calculateShippingFeeFromTemplate(templateWithItemFee, 0, 3, 'US');
    expect(fee).toBe(6.00); // $3 base + 3 × $1
  });

  it('caps items at maxItems', () => {
    const fee = calculateShippingFeeFromTemplate(templateWithItemFee, 0, 10, 'US');
    expect(fee).toBe(8.00); // $3 base + 5 items (capped) × $1
  });

  it('does not add item fee when no perItemFee', () => {
    const t = { ...templateWithItemFee, perItemFee: null, maxItems: null };
    const fee = calculateShippingFeeFromTemplate(t, 0, 10, 'US');
    expect(fee).toBe(3.00);
  });
});

describe('calculateShippingFeeFromTemplate — rounding', () => {
  it('rounds to 2 decimal places', () => {
    const template = {
      baseFee: 1.00,
      baseWeightLb: 0,
      perLbFee: 0.333,
      maxItems: null,
      perItemFee: null,
      surchargeAk: 0,
      surchargeHi: 0,
    };
    const fee = calculateShippingFeeFromTemplate(template, 1, 1, 'US');
    // $1.00 + 1 × $0.333 = $1.333 → rounds to $1.33
    expect(fee).toBe(1.33);
  });
});

// ---- createTemplateSchema validation ----
describe('createTemplateSchema', () => {
  const validId = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts valid template payload', () => {
    const result = createTemplateSchema.safeParse({
      name: 'Standard US',
      zoneId: validId,
      tier: 'standard',
      baseFee: 5.0,
      baseWeightLb: 2,
      perLbFee: 0.5,
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative baseFee', () => {
    const result = createTemplateSchema.safeParse({
      name: 'X', zoneId: validId, tier: 'std',
      baseFee: -1, baseWeightLb: 0, perLbFee: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID zoneId', () => {
    const result = createTemplateSchema.safeParse({
      name: 'X', zoneId: 'not-uuid', tier: 'std',
      baseFee: 0, baseWeightLb: 0, perLbFee: 0,
    });
    expect(result.success).toBe(false);
  });

  it('applies default surcharge values of 0', () => {
    const result = createTemplateSchema.safeParse({
      name: 'X', zoneId: validId, tier: 'std',
      baseFee: 5, baseWeightLb: 0, perLbFee: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.surchargeAk).toBe(0);
      expect(result.data.surchargeHi).toBe(0);
    }
  });
});
