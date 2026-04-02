/**
 * Unit tests — AES-256-GCM encryption helpers
 */
import { describe, it, expect, beforeAll } from 'vitest';

// Set test encryption key before importing the module
process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 64-char hex string
process.env.NODE_ENV = 'test';

const { encrypt, decrypt, encryptAmount, decryptAmount } =
  await import('../src/lib/encryption');

describe('encrypt / decrypt', () => {
  it('round-trips a plain string', () => {
    const plain = 'Hello, CampusOps!';
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it('produces different ciphertexts for the same input (random IV)', () => {
    const plain = 'same input';
    expect(encrypt(plain)).not.toBe(encrypt(plain));
  });

  it('throws on tampered ciphertext', () => {
    const enc = encrypt('data');
    const tampered = enc.slice(0, -4) + 'xxxx';
    expect(() => decrypt(tampered)).toThrow();
  });

  it('throws on invalid format', () => {
    expect(() => decrypt('notvalid')).toThrow('Invalid ciphertext format');
  });
});

describe('encryptAmount / decryptAmount', () => {
  it('round-trips a numeric amount', () => {
    expect(decryptAmount(encryptAmount(99.99))).toBeCloseTo(99.99);
  });

  it('preserves two decimal places', () => {
    expect(decryptAmount(encryptAmount(10))).toBe(10.0);
  });
});
