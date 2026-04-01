/**
 * Unit tests — extended stored-value logic
 *
 * Extends stored-value.test.ts with receipt formatting, transaction
 * type validation, edge-case balance arithmetic, and top-up constraints.
 * No DB, no network.
 */
import { describe, it, expect } from 'vitest';

process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_SECRET     = 'test-jwt-secret';
process.env.NODE_ENV       = 'test';

const { encryptAmount, decryptAmount } = await import('../src/lib/encryption');

// ============================================================
// Receipt text formatting (mirrored from generateReceiptText)
// ============================================================

interface MockTxn {
  id: string;
  createdAt: Date;
  type: string;
  amountEncrypted: string;
  balanceAfterEncrypted: string;
  referenceId: string | null;
  referenceType: string | null;
  note: string | null;
}

function buildReceiptText(txn: MockTxn): string {
  const amount = decryptAmount(txn.amountEncrypted);
  const balanceAfter = decryptAmount(txn.balanceAfterEncrypted);

  const lines = [
    '================================',
    '     STORED VALUE RECEIPT',
    '================================',
    `Date:          ${txn.createdAt.toISOString()}`,
    `Transaction:   ${txn.id}`,
    `Type:          ${txn.type.toUpperCase()}`,
    `Amount:        $${amount.toFixed(2)}`,
    `Balance After: $${balanceAfter.toFixed(2)}`,
  ];

  if (txn.referenceId) {
    lines.push(`Reference:     ${txn.referenceType ?? ''} ${txn.referenceId}`);
  }
  if (txn.note) {
    lines.push(`Note:          ${txn.note}`);
  }

  lines.push('================================');
  return lines.join('\n');
}

describe('receipt text formatting', () => {
  const baseDate = new Date('2026-03-31T10:00:00.000Z');

  it('contains the STORED VALUE RECEIPT header', () => {
    const txn: MockTxn = {
      id: 'txn-001',
      createdAt: baseDate,
      type: 'top_up',
      amountEncrypted: encryptAmount(50),
      balanceAfterEncrypted: encryptAmount(150),
      referenceId: null,
      referenceType: null,
      note: null,
    };
    const receipt = buildReceiptText(txn);
    expect(receipt).toContain('STORED VALUE RECEIPT');
  });

  it('includes the transaction id', () => {
    const txn: MockTxn = {
      id: 'txn-abc-123',
      createdAt: baseDate,
      type: 'spend',
      amountEncrypted: encryptAmount(25),
      balanceAfterEncrypted: encryptAmount(75),
      referenceId: null,
      referenceType: null,
      note: null,
    };
    const receipt = buildReceiptText(txn);
    expect(receipt).toContain('txn-abc-123');
  });

  it('shows type in uppercase', () => {
    const txn: MockTxn = {
      id: 'txn-002',
      createdAt: baseDate,
      type: 'top_up',
      amountEncrypted: encryptAmount(30),
      balanceAfterEncrypted: encryptAmount(130),
      referenceId: null,
      referenceType: null,
      note: null,
    };
    const receipt = buildReceiptText(txn);
    expect(receipt).toContain('Type:          TOP_UP');
  });

  it('shows amount formatted to 2 decimal places', () => {
    const txn: MockTxn = {
      id: 'txn-003',
      createdAt: baseDate,
      type: 'spend',
      amountEncrypted: encryptAmount(12.5),
      balanceAfterEncrypted: encryptAmount(87.5),
      referenceId: null,
      referenceType: null,
      note: null,
    };
    const receipt = buildReceiptText(txn);
    expect(receipt).toContain('$12.50');
  });

  it('shows balance after formatted to 2 decimal places', () => {
    const txn: MockTxn = {
      id: 'txn-004',
      createdAt: baseDate,
      type: 'spend',
      amountEncrypted: encryptAmount(10),
      balanceAfterEncrypted: encryptAmount(5.5),
      referenceId: null,
      referenceType: null,
      note: null,
    };
    const receipt = buildReceiptText(txn);
    expect(receipt).toContain('Balance After: $5.50');
  });

  it('includes reference line when referenceId is set', () => {
    const txn: MockTxn = {
      id: 'txn-005',
      createdAt: baseDate,
      type: 'spend',
      amountEncrypted: encryptAmount(20),
      balanceAfterEncrypted: encryptAmount(80),
      referenceId: 'fr-ref-001',
      referenceType: 'fulfillment',
      note: null,
    };
    const receipt = buildReceiptText(txn);
    expect(receipt).toContain('fr-ref-001');
    expect(receipt).toContain('fulfillment');
  });

  it('omits reference line when referenceId is null', () => {
    const txn: MockTxn = {
      id: 'txn-006',
      createdAt: baseDate,
      type: 'top_up',
      amountEncrypted: encryptAmount(50),
      balanceAfterEncrypted: encryptAmount(50),
      referenceId: null,
      referenceType: null,
      note: null,
    };
    const receipt = buildReceiptText(txn);
    expect(receipt).not.toContain('Reference:');
  });

  it('includes note line when note is set', () => {
    const txn: MockTxn = {
      id: 'txn-007',
      createdAt: baseDate,
      type: 'top_up',
      amountEncrypted: encryptAmount(100),
      balanceAfterEncrypted: encryptAmount(200),
      referenceId: null,
      referenceType: null,
      note: 'Admin manual top-up',
    };
    const receipt = buildReceiptText(txn);
    expect(receipt).toContain('Admin manual top-up');
  });

  it('omits note line when note is null', () => {
    const txn: MockTxn = {
      id: 'txn-008',
      createdAt: baseDate,
      type: 'top_up',
      amountEncrypted: encryptAmount(50),
      balanceAfterEncrypted: encryptAmount(50),
      referenceId: null,
      referenceType: null,
      note: null,
    };
    const receipt = buildReceiptText(txn);
    expect(receipt).not.toContain('Note:');
  });

  it('receipt starts and ends with separator line', () => {
    const txn: MockTxn = {
      id: 'txn-009',
      createdAt: baseDate,
      type: 'top_up',
      amountEncrypted: encryptAmount(10),
      balanceAfterEncrypted: encryptAmount(10),
      referenceId: null,
      referenceType: null,
      note: null,
    };
    const receipt = buildReceiptText(txn);
    const lines = receipt.split('\n');
    expect(lines[0]).toBe('================================');
    expect(lines[lines.length - 1]).toBe('================================');
  });

  it('includes ISO date string', () => {
    const txn: MockTxn = {
      id: 'txn-010',
      createdAt: new Date('2026-01-15T08:30:00.000Z'),
      type: 'spend',
      amountEncrypted: encryptAmount(5),
      balanceAfterEncrypted: encryptAmount(45),
      referenceId: null,
      referenceType: null,
      note: null,
    };
    const receipt = buildReceiptText(txn);
    expect(receipt).toContain('2026-01-15T08:30:00.000Z');
  });
});

// ============================================================
// Transaction type validation
// ============================================================

describe('transaction type validation', () => {
  const VALID_TYPES = ['topup', 'spend', 'compensation'];

  function isValidTransactionType(type: string): boolean {
    return VALID_TYPES.includes(type);
  }

  it('accepts "topup"', () => {
    expect(isValidTransactionType('topup')).toBe(true);
  });

  it('accepts "spend"', () => {
    expect(isValidTransactionType('spend')).toBe(true);
  });

  it('accepts "compensation"', () => {
    expect(isValidTransactionType('compensation')).toBe(true);
  });

  it('rejects "refund"', () => {
    expect(isValidTransactionType('refund')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidTransactionType('')).toBe(false);
  });

  it('rejects "SPEND" (case-sensitive)', () => {
    expect(isValidTransactionType('SPEND')).toBe(false);
  });

  it('rejects "transfer"', () => {
    expect(isValidTransactionType('transfer')).toBe(false);
  });
});

// ============================================================
// Edge-case balance arithmetic
// ============================================================

describe('edge-case balance arithmetic', () => {
  function spend(balance: number, amount: number): number {
    if (balance < amount) {
      const err: any = new Error('Insufficient stored value balance');
      err.code = 'INSUFFICIENT_BALANCE';
      throw err;
    }
    return balance - amount;
  }

  it('spending exactly the balance succeeds and results in 0', () => {
    expect(spend(100, 100)).toBe(0);
  });

  it('spending balance + 1 cent throws INSUFFICIENT_BALANCE', () => {
    expect(() => spend(100, 100.01)).toThrow('Insufficient stored value balance');
  });

  it('spending balance + 1 cent has correct error code', () => {
    try {
      spend(50, 50.01);
    } catch (e: any) {
      expect(e.code).toBe('INSUFFICIENT_BALANCE');
    }
  });

  it('spending 0 from any balance succeeds', () => {
    expect(spend(200, 0)).toBe(200);
  });

  it('spending 0 from zero balance succeeds', () => {
    expect(spend(0, 0)).toBe(0);
  });

  it('spending 1 cent from zero balance throws', () => {
    expect(() => spend(0, 0.01)).toThrow();
  });

  it('spending fractional amount from sufficient balance', () => {
    expect(spend(99.99, 49.99)).toBeCloseTo(50.00);
  });
});

// ============================================================
// Top-up constraints
// ============================================================

describe('top-up amount constraint: must be > 0 and <= 10000', () => {
  function validateTopUp(amount: number): { valid: boolean; code?: string } {
    if (amount <= 0 || amount > 10000) {
      return { valid: false, code: 'INVALID_AMOUNT' };
    }
    return { valid: true };
  }

  it('accepts minimum positive amount (0.01)', () => {
    expect(validateTopUp(0.01).valid).toBe(true);
  });

  it('accepts typical amount ($50)', () => {
    expect(validateTopUp(50).valid).toBe(true);
  });

  it('accepts maximum allowed amount (10000)', () => {
    expect(validateTopUp(10000).valid).toBe(true);
  });

  it('rejects zero', () => {
    const result = validateTopUp(0);
    expect(result.valid).toBe(false);
    expect(result.code).toBe('INVALID_AMOUNT');
  });

  it('rejects negative amount', () => {
    expect(validateTopUp(-1).valid).toBe(false);
  });

  it('rejects amount just above cap (10000.01)', () => {
    expect(validateTopUp(10000.01).valid).toBe(false);
  });

  it('rejects amount far above cap', () => {
    expect(validateTopUp(99999).valid).toBe(false);
  });

  it('error code is INVALID_AMOUNT when rejected', () => {
    expect(validateTopUp(-50).code).toBe('INVALID_AMOUNT');
  });
});

// ============================================================
// Encrypt / decrypt round-trip for amounts used in receipts
// ============================================================

describe('encrypt/decrypt round-trip for receipt amounts', () => {
  it('$0.00 round-trips correctly', () => {
    expect(decryptAmount(encryptAmount(0))).toBe(0);
  });

  it('$100.00 round-trips correctly', () => {
    expect(decryptAmount(encryptAmount(100))).toBe(100);
  });

  it('$9999.99 round-trips correctly', () => {
    expect(decryptAmount(encryptAmount(9999.99))).toBe(9999.99);
  });

  it('$0.01 round-trips correctly', () => {
    expect(decryptAmount(encryptAmount(0.01))).toBe(0.01);
  });

  it('amount is stored as fixed 2-decimal string', () => {
    // encryptAmount calls toFixed(2), so $5.5 becomes "5.50"
    const enc = encryptAmount(5.5);
    expect(decryptAmount(enc)).toBe(5.5);
  });
});

// ============================================================
// Membership tier schema
// ============================================================

describe('createTierSchema validation', () => {
  const { createTierSchema } = await import('../src/modules/membership/membership.service');

  it('accepts valid tier', () => {
    const result = createTierSchema.safeParse({
      name: 'Gold',
      discountPercent: 10.00,
      pointThreshold: 500,
      benefits: 'Priority support and 10% discount',
    });
    expect(result.success).toBe(true);
  });

  it('rejects discountPercent above 100', () => {
    const result = createTierSchema.safeParse({
      name: 'Platinum',
      discountPercent: 101,
      pointThreshold: 1000,
      benefits: 'Full discount',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative discountPercent', () => {
    const result = createTierSchema.safeParse({
      name: 'Silver',
      discountPercent: -5,
      pointThreshold: 100,
      benefits: 'Some benefits',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative pointThreshold', () => {
    const result = createTierSchema.safeParse({
      name: 'Bronze',
      discountPercent: 5,
      pointThreshold: -1,
      benefits: 'Entry level',
    });
    expect(result.success).toBe(false);
  });

  it('accepts pointThreshold of 0 (entry tier)', () => {
    const result = createTierSchema.safeParse({
      name: 'Entry',
      discountPercent: 0,
      pointThreshold: 0,
      benefits: 'Basic membership',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = createTierSchema.safeParse({
      name: '',
      discountPercent: 5,
      pointThreshold: 0,
      benefits: 'Benefits here',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty benefits', () => {
    const result = createTierSchema.safeParse({
      name: 'Gold',
      discountPercent: 5,
      pointThreshold: 0,
      benefits: '',
    });
    expect(result.success).toBe(false);
  });

  it('accepts non-integer discountPercent with 2 decimal places', () => {
    const result = createTierSchema.safeParse({
      name: 'Silver',
      discountPercent: 7.50,
      pointThreshold: 200,
      benefits: '7.5% discount',
    });
    expect(result.success).toBe(true);
  });
});
