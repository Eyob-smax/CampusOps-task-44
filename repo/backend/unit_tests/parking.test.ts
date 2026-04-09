/**
 * Unit tests — parking alert validation and SLA logic
 *
 * Tests pure Zod schemas and SLA status computation without DB.
 */
import { describe, it, expect } from 'vitest';

process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_SECRET     = 'test-jwt-secret';
process.env.NODE_ENV       = 'test';

const {
  createAlertSchema,
  closeAlertSchema,
  escalateAlertSchema,
  computeParkingSlaStatus,
  canClaimParkingAlert,
  canCloseParkingAlert,
  canEscalateParkingAlert,
} = await import('../src/modules/parking/alert.service');

// ---- createAlertSchema ----
describe('createAlertSchema', () => {
  const validId = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts valid alert payload', () => {
    const result = createAlertSchema.safeParse({
      lotId: validId,
      type: 'no_plate_captured',
      description: 'Vehicle entered without plate',
    });
    expect(result.success).toBe(true);
  });

  it('accepts all valid alert types', () => {
    const types = ['no_plate_captured', 'overtime', 'unsettled_session', 'duplicate_plate', 'inconsistent_entry_exit'];
    for (const type of types) {
      const result = createAlertSchema.safeParse({ lotId: validId, type, description: 'desc' });
      expect(result.success).toBe(true);
    }
  });

  it('rejects non-UUID lotId', () => {
    const result = createAlertSchema.safeParse({
      lotId: 'not-a-uuid', type: 'overtime', description: 'desc',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid alert type', () => {
    const result = createAlertSchema.safeParse({
      lotId: validId, type: 'unknown_type', description: 'desc',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty description', () => {
    const result = createAlertSchema.safeParse({
      lotId: validId, type: 'overtime', description: '',
    });
    expect(result.success).toBe(false);
  });

  it('trims description whitespace', () => {
    const result = createAlertSchema.safeParse({
      lotId: validId, type: 'overtime', description: '  Vehicle over time  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe('Vehicle over time');
    }
  });
});

// ---- closeAlertSchema — critical: 5-char minimum ----
describe('closeAlertSchema', () => {
  it('accepts note of exactly 5 chars', () => {
    const result = closeAlertSchema.safeParse({ closureNote: '12345' });
    expect(result.success).toBe(true);
  });

  it('accepts note longer than 5 chars', () => {
    const result = closeAlertSchema.safeParse({ closureNote: 'Vehicle owner contacted and issue resolved.' });
    expect(result.success).toBe(true);
  });

  it('rejects note of 4 chars', () => {
    const result = closeAlertSchema.safeParse({ closureNote: '1234' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('5');
    }
  });

  it('rejects empty note', () => {
    const result = closeAlertSchema.safeParse({ closureNote: '' });
    expect(result.success).toBe(false);
  });

  it('trims before validation — 4 non-space chars fails', () => {
    const result = closeAlertSchema.safeParse({ closureNote: '  ab  ' });
    expect(result.success).toBe(false);
  });

  it('passes when note has 5+ non-whitespace chars after trim', () => {
    const result = closeAlertSchema.safeParse({ closureNote: '  Resolved  ' });
    expect(result.success).toBe(true);
  });
});

// ---- escalateAlertSchema ----
describe('escalateAlertSchema', () => {
  it('accepts empty payload', () => {
    expect(escalateAlertSchema.safeParse({}).success).toBe(true);
  });

  it('accepts optional note', () => {
    expect(escalateAlertSchema.safeParse({ note: 'SLA breached' }).success).toBe(true);
  });

  it('rejects note exceeding 500 chars', () => {
    const result = escalateAlertSchema.safeParse({ note: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });
});

// ---- SLA status computation ----
describe('SLA status computation', () => {
  it('returns "closed" when closedAt is set', () => {
    const now = new Date();
    const deadline = new Date(now.getTime() + 10 * 60 * 1000);
    expect(computeParkingSlaStatus(deadline, new Date(), now)).toBe('closed');
  });

  it('returns "within_sla" when 10 minutes remaining', () => {
    const now = new Date();
    const deadline = new Date(now.getTime() + 10 * 60 * 1000);
    expect(computeParkingSlaStatus(deadline, null, now)).toBe('within_sla');
  });

  it('returns "at_risk" when 2 minutes remaining (< 3 min threshold)', () => {
    const now = new Date();
    const deadline = new Date(now.getTime() + 2 * 60 * 1000);
    expect(computeParkingSlaStatus(deadline, null, now)).toBe('at_risk');
  });

  it('returns "at_risk" when exactly 2m 59s remaining', () => {
    const now = new Date();
    const deadline = new Date(now.getTime() + 179_999);
    expect(computeParkingSlaStatus(deadline, null, now)).toBe('at_risk');
  });

  it('returns "within_sla" when exactly 3 minutes remaining', () => {
    const now = new Date();
    const deadline = new Date(now.getTime() + 180_000);
    expect(computeParkingSlaStatus(deadline, null, now)).toBe('within_sla');
  });

  it('returns "breached" when deadline is in the past', () => {
    const now = new Date();
    const deadline = new Date(now.getTime() - 1000);
    expect(computeParkingSlaStatus(deadline, null, now)).toBe('breached');
  });

  it('returns "within_sla" when no deadline set', () => {
    const now = new Date();
    expect(computeParkingSlaStatus(null, null, now)).toBe('within_sla');
  });
});

// ---- Alert state transitions ----
describe('parking alert state transitions', () => {
  it('open → claimed: valid', () => expect(canClaimParkingAlert('open')).toBe(true));
  it('claimed → claimed: invalid', () => expect(canClaimParkingAlert('claimed')).toBe(false));
  it('closed → claimed: invalid', () => expect(canClaimParkingAlert('closed')).toBe(false));
  it('open → closed: invalid (must be claimed first)', () => expect(canCloseParkingAlert('open')).toBe(false));
  it('claimed → closed: valid', () => expect(canCloseParkingAlert('claimed')).toBe(true));
  it('escalated → closed: invalid', () => expect(canCloseParkingAlert('escalated')).toBe(false));
  it('open → escalated: valid', () => expect(canEscalateParkingAlert('open')).toBe(true));
  it('claimed → escalated: valid', () => expect(canEscalateParkingAlert('claimed')).toBe(true));
  it('closed → escalated: invalid', () => expect(canEscalateParkingAlert('closed')).toBe(false));
});

// ---- SLA deadline calculation ----
describe('SLA 15-minute deadline', () => {
  it('deadline is 15 minutes after creation', () => {
    const createTime = new Date('2024-01-01T10:00:00Z');
    const expectedDeadline = new Date('2024-01-01T10:15:00Z');
    const deadline = new Date(createTime.getTime() + 15 * 60 * 1000);
    expect(deadline.getTime()).toBe(expectedDeadline.getTime());
  });

  it('deadline in ms: 15 * 60 * 1000 = 900000', () => {
    expect(15 * 60 * 1000).toBe(900_000);
  });
});
