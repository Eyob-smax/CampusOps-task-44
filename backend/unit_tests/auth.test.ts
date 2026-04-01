/**
 * Unit tests — auth service logic (no DB — tests pure functions)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Minimal env for config
process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_SECRET     = 'test-jwt-secret-for-unit-tests-only';
process.env.NODE_ENV       = 'test';
process.env.DB_HOST        = 'localhost';

// The validator shapes
const { loginSchema, changePasswordSchema } = await import('../src/modules/auth/auth.validator');

describe('loginSchema', () => {
  it('accepts valid credentials', () => {
    expect(() => loginSchema.parse({ username: 'admin', password: 'secret' })).not.toThrow();
  });

  it('rejects empty username', () => {
    expect(() => loginSchema.parse({ username: '', password: 'secret' })).toThrow();
  });

  it('rejects empty password', () => {
    expect(() => loginSchema.parse({ username: 'admin', password: '' })).toThrow();
  });

  it('trims username whitespace', () => {
    const result = loginSchema.parse({ username: '  admin  ', password: 'pw' });
    expect(result.username).toBe('admin');
  });
});

describe('changePasswordSchema', () => {
  it('accepts strong password', () => {
    expect(() =>
      changePasswordSchema.parse({
        currentPassword: 'OldPass1!',
        newPassword: 'NewStrongP@ss1!',
      })
    ).not.toThrow();
  });

  it('rejects password shorter than 12 chars', () => {
    expect(() =>
      changePasswordSchema.parse({ currentPassword: 'OldPass1!', newPassword: 'Short1!' })
    ).toThrow();
  });

  it('rejects password without uppercase', () => {
    expect(() =>
      changePasswordSchema.parse({ currentPassword: 'OldPass1!', newPassword: 'nouppercase1!' })
    ).toThrow();
  });

  it('rejects password without special char', () => {
    expect(() =>
      changePasswordSchema.parse({ currentPassword: 'OldPass1!', newPassword: 'NoSpecialChar1A' })
    ).toThrow();
  });
});

describe('JWT structure', () => {
  const secret = 'test-jwt-secret-for-unit-tests-only';

  it('signs and verifies a token with expected claims', () => {
    const payload = { id: 'user-1', username: 'admin', role: 'administrator', jti: 'uuid-1' };
    const token = jwt.sign(payload, secret, { expiresIn: '15m' });
    const decoded = jwt.verify(token, secret) as typeof payload;
    expect(decoded.id).toBe('user-1');
    expect(decoded.role).toBe('administrator');
    expect(decoded.jti).toBe('uuid-1');
  });

  it('rejects a token with wrong secret', () => {
    const token = jwt.sign({ id: 'x' }, 'wrong-secret');
    expect(() => jwt.verify(token, secret)).toThrow();
  });

  it('rejects expired token', async () => {
    const token = jwt.sign({ id: 'x' }, secret, { expiresIn: '1ms' });
    await new Promise(r => setTimeout(r, 10));
    expect(() => jwt.verify(token, secret)).toThrow();
  });
});
