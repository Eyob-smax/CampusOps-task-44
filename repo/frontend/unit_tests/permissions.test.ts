import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Globals provided by setup.ts

vi.mock('../src/api/client', () => ({
  apiClient: { post: vi.fn().mockResolvedValue(undefined), get: vi.fn() },
}));

import { useAuthStore } from '../src/stores/auth';
import type { AuthUser, UserRole } from '../src/types';

// ---------------------------------------------------------------------------
// The permission matrix — mirrored from auth.ts for exhaustive testing
// ---------------------------------------------------------------------------
const PERMISSIONS: Record<string, string[]> = {
  'users:read': ['administrator'],
  'users:create': ['administrator'],
  'audit:read': ['administrator', 'auditor'],
  'audit:reveal-pii': ['administrator'],
  'settings:read': ['administrator'],
  'settings:update': ['administrator'],
  'integration-keys:manage': ['administrator'],
  'backup:read': ['administrator'],
  'classroom:read': ['administrator', 'classroom_supervisor'],
  'parking:read': ['administrator', 'operations_manager', 'classroom_supervisor'],
  'warehouse:read': ['administrator', 'operations_manager'],
  'fulfillment:read': ['administrator', 'operations_manager', 'customer_service_agent', 'auditor'],
  'after-sales:read': ['administrator', 'operations_manager', 'customer_service_agent', 'auditor'],
  'shipment:read': ['administrator', 'operations_manager', 'customer_service_agent', 'auditor'],
  'stored-value:read': ['administrator', 'operations_manager'],
  'stored-value:topup': ['administrator', 'operations_manager'],
  'stored-value:spend': ['administrator', 'operations_manager', 'customer_service_agent'],
  'metrics:read': ['administrator'],
  'logs:read': ['administrator'],
};

const ALL_ROLES: UserRole[] = [
  'administrator',
  'operations_manager',
  'classroom_supervisor',
  'customer_service_agent',
  'auditor',
];

function makeUser(role: UserRole): AuthUser {
  return { id: '1', username: 'test', role };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Permissions matrix', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  // -----------------------------------------------------------------------
  // All 5 roles are present somewhere in the matrix
  // -----------------------------------------------------------------------
  it('all 5 roles appear in the permission matrix', () => {
    const rolesInMatrix = new Set<string>();
    for (const roles of Object.values(PERMISSIONS)) {
      roles.forEach((r) => rolesInMatrix.add(r));
    }
    for (const role of ALL_ROLES) {
      expect(rolesInMatrix.has(role)).toBe(true);
    }
  });

  // -----------------------------------------------------------------------
  // Administrator has ALL permissions
  // -----------------------------------------------------------------------
  describe('administrator has all permissions', () => {
    it.each(Object.keys(PERMISSIONS))('%s', (perm) => {
      const store = useAuthStore();
      store.user = makeUser('administrator');
      store.accessToken = 'tok';
      expect(store.can(perm)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Auditor has only read-oriented permissions
  // -----------------------------------------------------------------------
  describe('auditor permissions', () => {
    const auditorPermissions = [
      'audit:read',
      'fulfillment:read',
      'after-sales:read',
      'shipment:read',
    ];

    it.each(auditorPermissions)('auditor CAN %s', (perm) => {
      const store = useAuthStore();
      store.user = makeUser('auditor');
      store.accessToken = 'tok';
      expect(store.can(perm)).toBe(true);
    });

    const auditorDenied = Object.keys(PERMISSIONS).filter(
      (p) => !auditorPermissions.includes(p),
    );

    it.each(auditorDenied)('auditor CANNOT %s', (perm) => {
      const store = useAuthStore();
      store.user = makeUser('auditor');
      store.accessToken = 'tok';
      expect(store.can(perm)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Classroom supervisor — classroom + parking
  // -----------------------------------------------------------------------
  describe('classroom_supervisor permissions', () => {
    const allowed = ['classroom:read', 'parking:read'];
    const denied = Object.keys(PERMISSIONS).filter((p) => !allowed.includes(p));

    it.each(allowed)('classroom_supervisor CAN %s', (perm) => {
      const store = useAuthStore();
      store.user = makeUser('classroom_supervisor');
      store.accessToken = 'tok';
      expect(store.can(perm)).toBe(true);
    });

    it.each(denied)('classroom_supervisor CANNOT %s', (perm) => {
      const store = useAuthStore();
      store.user = makeUser('classroom_supervisor');
      store.accessToken = 'tok';
      expect(store.can(perm)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Customer service agent — fulfillment + after-sales + shipment
  // -----------------------------------------------------------------------
  describe('customer_service_agent permissions', () => {
    const allowed = ['fulfillment:read', 'after-sales:read', 'shipment:read', 'stored-value:spend'];
    const denied = Object.keys(PERMISSIONS).filter((p) => !allowed.includes(p));

    it.each(allowed)('customer_service_agent CAN %s', (perm) => {
      const store = useAuthStore();
      store.user = makeUser('customer_service_agent');
      store.accessToken = 'tok';
      expect(store.can(perm)).toBe(true);
    });

    it.each(denied)('customer_service_agent CANNOT %s', (perm) => {
      const store = useAuthStore();
      store.user = makeUser('customer_service_agent');
      store.accessToken = 'tok';
      expect(store.can(perm)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Operations manager — parking, warehouse, fulfillment, after-sales, shipment
  // -----------------------------------------------------------------------
  describe('operations_manager permissions', () => {
    const allowed = [
      'parking:read',
      'warehouse:read',
      'fulfillment:read',
      'after-sales:read',
      'shipment:read',
      'stored-value:read',
      'stored-value:topup',
      'stored-value:spend',
    ];
    const denied = Object.keys(PERMISSIONS).filter((p) => !allowed.includes(p));

    it.each(allowed)('operations_manager CAN %s', (perm) => {
      const store = useAuthStore();
      store.user = makeUser('operations_manager');
      store.accessToken = 'tok';
      expect(store.can(perm)).toBe(true);
    });

    it.each(denied)('operations_manager CANNOT %s', (perm) => {
      const store = useAuthStore();
      store.user = makeUser('operations_manager');
      store.accessToken = 'tok';
      expect(store.can(perm)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Exhaustive cross-check: every (role, permission) pair
  // -----------------------------------------------------------------------
  describe('exhaustive role-permission cross-check', () => {
    for (const role of ALL_ROLES) {
      for (const perm of Object.keys(PERMISSIONS)) {
        const shouldAllow = PERMISSIONS[perm].includes(role);
        it(`${role} ${shouldAllow ? 'CAN' : 'CANNOT'} ${perm}`, () => {
          const store = useAuthStore();
          store.user = makeUser(role);
          store.accessToken = 'tok';
          expect(store.can(perm)).toBe(shouldAllow);
        });
      }
    }
  });
});
