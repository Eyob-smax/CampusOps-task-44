import { describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.ENCRYPTION_KEY = 'a'.repeat(64);

const { normalizeThresholdOperator } = await import(
  '../src/modules/observability/threshold-operator'
);
const { createThresholdSchema, updateThresholdSchema } = await import(
  '../src/modules/observability/threshold.service'
);

describe('normalizeThresholdOperator', () => {
  it('normalizes canonical symbol operators', () => {
    expect(normalizeThresholdOperator('>')).toBe('>');
    expect(normalizeThresholdOperator('<')).toBe('<');
    expect(normalizeThresholdOperator('>=')).toBe('>=');
    expect(normalizeThresholdOperator('<=')).toBe('<=');
    expect(normalizeThresholdOperator('==')).toBe('==');
  });

  it('normalizes legacy token aliases', () => {
    expect(normalizeThresholdOperator('gt')).toBe('>');
    expect(normalizeThresholdOperator('lt')).toBe('<');
    expect(normalizeThresholdOperator('gte')).toBe('>=');
    expect(normalizeThresholdOperator('lte')).toBe('<=');
    expect(normalizeThresholdOperator('eq')).toBe('==');
  });

  it('returns null for unknown operators', () => {
    expect(normalizeThresholdOperator('!=')).toBeNull();
    expect(normalizeThresholdOperator('')).toBeNull();
    expect(normalizeThresholdOperator('between')).toBeNull();
  });
});

describe('threshold schemas', () => {
  it('createThresholdSchema canonicalizes alias operators', () => {
    const parsed = createThresholdSchema.parse({
      metricName: 'cpu_utilization_percent',
      operator: 'gt',
      value: 85,
    });

    expect(parsed.operator).toBe('>');
  });

  it('updateThresholdSchema canonicalizes eq alias', () => {
    const parsed = updateThresholdSchema.parse({ operator: 'eq' });
    expect(parsed.operator).toBe('==');
  });

  it('rejects invalid operator tokens', () => {
    expect(() =>
      createThresholdSchema.parse({
        metricName: 'cpu_utilization_percent',
        operator: '!=',
        value: 85,
      }),
    ).toThrow();
  });
});
