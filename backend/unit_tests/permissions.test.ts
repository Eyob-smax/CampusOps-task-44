/**
 * Unit tests — Permission matrix
 */
import { describe, it, expect } from 'vitest';
import { can, getRolePermissions } from '../src/lib/permissions';

describe('can()', () => {
  it('administrator can do everything', () => {
    expect(can('administrator', 'users:create')).toBe(true);
    expect(can('administrator', 'audit:reveal-pii')).toBe(true);
    expect(can('administrator', 'backup:manage')).toBe(true);
    expect(can('administrator', 'compensation:approve-override')).toBe(true);
  });

  it('auditor can read audit logs but not reveal PII', () => {
    expect(can('auditor', 'audit:read')).toBe(true);
    expect(can('auditor', 'audit:reveal-pii')).toBe(false);
  });

  it('auditor cannot create users', () => {
    expect(can('auditor', 'users:create')).toBe(false);
  });

  it('operations_manager can manage warehouses', () => {
    expect(can('operations_manager', 'warehouse:read')).toBe(true);
    expect(can('operations_manager', 'warehouse:write')).toBe(true);
  });

  it('classroom_supervisor cannot manage warehouses', () => {
    expect(can('classroom_supervisor', 'warehouse:read')).toBe(false);
    expect(can('classroom_supervisor', 'warehouse:write')).toBe(false);
  });

  it('classroom_supervisor can acknowledge and resolve anomalies', () => {
    expect(can('classroom_supervisor', 'anomaly:acknowledge')).toBe(true);
    expect(can('classroom_supervisor', 'anomaly:assign')).toBe(true);
    expect(can('classroom_supervisor', 'anomaly:resolve')).toBe(true);
  });

  it('customer_service_agent can suggest compensation but not approve-full', () => {
    expect(can('customer_service_agent', 'compensation:suggest')).toBe(true);
    expect(can('customer_service_agent', 'compensation:approve-limited')).toBe(true);
    expect(can('customer_service_agent', 'compensation:approve-full')).toBe(false);
  });

  it('operations_manager can approve-full but not override', () => {
    expect(can('operations_manager', 'compensation:approve-full')).toBe(true);
    expect(can('operations_manager', 'compensation:approve-override')).toBe(false);
  });

  it('auditor cannot write master data', () => {
    expect(can('auditor', 'master-data:write')).toBe(false);
    expect(can('auditor', 'students:write')).toBe(false);
  });

  it('all roles can read master data', () => {
    const roles = ['administrator', 'operations_manager', 'classroom_supervisor', 'customer_service_agent', 'auditor'] as const;
    roles.forEach(r => expect(can(r, 'master-data:read')).toBe(true));
  });
});

describe('getRolePermissions()', () => {
  it('returns non-empty list for every role', () => {
    const roles = ['administrator', 'operations_manager', 'classroom_supervisor', 'customer_service_agent', 'auditor'] as const;
    roles.forEach(r => expect(getRolePermissions(r).length).toBeGreaterThan(0));
  });

  it('administrator has more permissions than auditor', () => {
    expect(getRolePermissions('administrator').length).toBeGreaterThan(getRolePermissions('auditor').length);
  });
});
