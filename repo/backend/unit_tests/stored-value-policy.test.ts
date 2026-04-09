import { describe, expect, it } from 'vitest';

process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';

const {
  parseStoredValueEnabled,
  parseTopUpApprovalThreshold,
  requiresTopUpApproval,
  canApproveHighValueTopUp,
} = await import('../src/modules/stored-value/stored-value.service');

describe('stored value policy helpers', () => {
  it('enables feature for true-like values', () => {
    expect(parseStoredValueEnabled('true')).toBe(true);
    expect(parseStoredValueEnabled('1')).toBe(true);
    expect(parseStoredValueEnabled('yes')).toBe(true);
  });

  it('disables feature for false-like values', () => {
    expect(parseStoredValueEnabled('false')).toBe(false);
    expect(parseStoredValueEnabled('0')).toBe(false);
    expect(parseStoredValueEnabled('off')).toBe(false);
  });

  it('uses safe default when feature flag setting is missing', () => {
    expect(parseStoredValueEnabled(null)).toBe(true);
  });

  it('parses explicit top-up threshold from settings', () => {
    expect(parseTopUpApprovalThreshold('250.50')).toBe(250.5);
  });

  it('falls back to default threshold for invalid values', () => {
    expect(parseTopUpApprovalThreshold('not-a-number')).toBe(200);
    expect(parseTopUpApprovalThreshold('-10')).toBe(200);
  });

  it('marks amounts above threshold as requiring approval', () => {
    expect(requiresTopUpApproval(200, 200)).toBe(false);
    expect(requiresTopUpApproval(200.01, 200)).toBe(true);
  });

  it('accepts only administrator and operations_manager for high-value approvals', () => {
    expect(canApproveHighValueTopUp({ id: '1', username: 'a', role: 'administrator', campusId: 'main-campus' })).toBe(true);
    expect(canApproveHighValueTopUp({ id: '2', username: 'o', role: 'operations_manager', campusId: 'main-campus' })).toBe(true);
    expect(canApproveHighValueTopUp({ id: '3', username: 'c', role: 'customer_service_agent', campusId: 'main-campus' })).toBe(false);
    expect(canApproveHighValueTopUp(undefined)).toBe(false);
  });
});
