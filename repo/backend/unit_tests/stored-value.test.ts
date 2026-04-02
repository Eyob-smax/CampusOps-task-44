/**
 * Unit tests — stored value encryption and balance logic
 *
 * Tests encryption round-trip and balance arithmetic without DB.
 */
import { describe, it, expect } from 'vitest';

process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_SECRET     = 'test-jwt-secret';
process.env.NODE_ENV       = 'test';

const { encryptAmount, decryptAmount } = await import('../src/lib/encryption');

// ---- Encryption round-trip ----
describe('encryptAmount / decryptAmount', () => {
  it('encrypts and decrypts back to original value', () => {
    const original = 123.45;
    const encrypted = encryptAmount(original);
    const decrypted = decryptAmount(encrypted);
    expect(decrypted).toBe(original);
  });

  it('works for zero balance', () => {
    const encrypted = encryptAmount(0);
    expect(decryptAmount(encrypted)).toBe(0);
  });

  it('works for large amounts', () => {
    const encrypted = encryptAmount(9999.99);
    expect(decryptAmount(encrypted)).toBe(9999.99);
  });

  it('produces different ciphertexts for same value (non-deterministic)', () => {
    const a = encryptAmount(100);
    const b = encryptAmount(100);
    // Encryption should use random IV — ciphertexts must differ
    expect(a).not.toBe(b);
  });

  it('encrypted value is a non-empty string', () => {
    const encrypted = encryptAmount(50);
    expect(typeof encrypted).toBe('string');
    expect(encrypted.length).toBeGreaterThan(0);
  });
});

// ---- Stored value balance arithmetic ----
describe('stored value balance arithmetic', () => {
  function topUp(currentBalance: number, amount: number): number {
    return currentBalance + amount;
  }

  function spend(currentBalance: number, amount: number): number {
    if (currentBalance < amount) {
      throw Object.assign(new Error('Insufficient balance'), { code: 'INSUFFICIENT_BALANCE' });
    }
    return currentBalance - amount;
  }

  it('top up increases balance', () => {
    expect(topUp(100, 50)).toBe(150);
  });

  it('top up from zero', () => {
    expect(topUp(0, 25)).toBe(25);
  });

  it('spend reduces balance', () => {
    expect(spend(100, 30)).toBe(70);
  });

  it('spend exact balance leaves zero', () => {
    expect(spend(50, 50)).toBe(0);
  });

  it('spend throws when balance insufficient', () => {
    expect(() => spend(20, 30)).toThrowError('Insufficient balance');
  });

  it('spend throws with correct error code', () => {
    try {
      spend(0, 1);
    } catch (e: any) {
      expect(e.code).toBe('INSUFFICIENT_BALANCE');
    }
  });

  it('multiple top-ups accumulate correctly', () => {
    let balance = 0;
    balance = topUp(balance, 100);
    balance = topUp(balance, 50);
    balance = topUp(balance, 25.50);
    expect(balance).toBe(175.50);
  });

  it('top-up then spend sequence is correct', () => {
    let balance = topUp(0, 200);
    balance = spend(balance, 75.25);
    expect(balance).toBeCloseTo(124.75);
  });
});

// ---- Top-up amount validation ----
describe('top-up amount constraints', () => {
  function validateTopUpAmount(amount: number): boolean {
    return amount > 0 && amount <= 10000;
  }

  it('accepts positive amount', () => {
    expect(validateTopUpAmount(50)).toBe(true);
  });

  it('accepts max allowed amount (10000)', () => {
    expect(validateTopUpAmount(10000)).toBe(true);
  });

  it('rejects zero amount', () => {
    expect(validateTopUpAmount(0)).toBe(false);
  });

  it('rejects negative amount', () => {
    expect(validateTopUpAmount(-1)).toBe(false);
  });

  it('rejects amount exceeding 10000', () => {
    expect(validateTopUpAmount(10001)).toBe(false);
  });

  it('accepts 0.01 (minimum positive)', () => {
    expect(validateTopUpAmount(0.01)).toBe(true);
  });
});
