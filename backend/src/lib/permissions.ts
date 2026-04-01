import type { UserRole } from '../types';

// ============================================================
// Permission matrix — single source of truth for all RBAC
// checks in the backend.
// ============================================================

export type Permission =
  // Auth & users
  | 'users:read'
  | 'users:create'
  | 'users:update'
  | 'users:delete'
  | 'users:change-role'
  // Audit
  | 'audit:read'
  | 'audit:reveal-pii'
  // Settings & keys
  | 'settings:read'
  | 'settings:update'
  | 'integration-keys:manage'
  // Backup
  | 'backup:read'
  | 'backup:manage'
  // Master data
  | 'master-data:read'
  | 'master-data:write'
  | 'students:read'
  | 'students:write'
  | 'students:import'
  // Classroom
  | 'classroom:read'
  | 'classroom:manage'
  | 'anomaly:acknowledge'
  | 'anomaly:assign'
  | 'anomaly:resolve'
  // Parking
  | 'parking:read'
  | 'parking:manage'
  | 'parking-alert:claim'
  | 'parking-alert:close'
  // Warehouse & logistics
  | 'warehouse:read'
  | 'warehouse:write'
  | 'carrier:read'
  | 'carrier:write'
  | 'delivery-zone:read'
  | 'delivery-zone:write'
  | 'shipping-template:read'
  | 'shipping-template:write'
  // Membership
  | 'membership:read'
  | 'membership:write'
  | 'coupon:read'
  | 'coupon:write'
  // Fulfillment
  | 'fulfillment:read'
  | 'fulfillment:create'
  | 'fulfillment:manage'
  // Shipments
  | 'shipment:read'
  | 'shipment:write'
  | 'shipment:intervene'
  // After-sales
  | 'after-sales:read'
  | 'after-sales:create'
  | 'after-sales:manage'
  // Compensation
  | 'compensation:suggest'
  | 'compensation:approve-limited'   // up to $25
  | 'compensation:approve-full'      // up to cap
  | 'compensation:approve-override'  // above cap
  // Stored value
  | 'stored-value:read'
  | 'stored-value:topup'
  | 'stored-value:spend'
  // Files
  | 'files:upload'
  | 'files:delete'
  // Jobs & observability
  | 'jobs:read'
  | 'jobs:manage'
  | 'metrics:read'
  | 'logs:read'
  | 'alerts:read'
  | 'alerts:manage';

const PERMISSION_MATRIX: Record<Permission, UserRole[]> = {
  // ---- Auth & users (admin only) ----
  'users:read':              ['administrator'],
  'users:create':            ['administrator'],
  'users:update':            ['administrator'],
  'users:delete':            ['administrator'],
  'users:change-role':       ['administrator'],

  // ---- Audit ----
  'audit:read':              ['administrator', 'auditor'],
  'audit:reveal-pii':        ['administrator'],

  // ---- Settings & keys ----
  'settings:read':           ['administrator'],
  'settings:update':         ['administrator'],
  'integration-keys:manage': ['administrator'],

  // ---- Backup ----
  'backup:read':             ['administrator'],
  'backup:manage':           ['administrator'],

  // ---- Master data ----
  'master-data:read':        ['administrator', 'operations_manager', 'classroom_supervisor', 'customer_service_agent', 'auditor'],
  'master-data:write':       ['administrator', 'operations_manager'],
  'students:read':           ['administrator', 'operations_manager', 'classroom_supervisor', 'customer_service_agent', 'auditor'],
  'students:write':          ['administrator', 'operations_manager'],
  'students:import':         ['administrator', 'operations_manager'],

  // ---- Classroom ----
  'classroom:read':          ['administrator', 'classroom_supervisor'],
  'classroom:manage':        ['administrator', 'classroom_supervisor'],
  'anomaly:acknowledge':     ['administrator', 'classroom_supervisor'],
  'anomaly:assign':          ['administrator', 'classroom_supervisor'],
  'anomaly:resolve':         ['administrator', 'classroom_supervisor'],

  // ---- Parking ----
  'parking:read':            ['administrator', 'operations_manager', 'classroom_supervisor'],
  'parking:manage':          ['administrator', 'operations_manager', 'classroom_supervisor'],
  'parking-alert:claim':     ['administrator', 'classroom_supervisor'],
  'parking-alert:close':     ['administrator', 'classroom_supervisor'],

  // ---- Warehouse & logistics ----
  'warehouse:read':          ['administrator', 'operations_manager'],
  'warehouse:write':         ['administrator', 'operations_manager'],
  'carrier:read':            ['administrator', 'operations_manager'],
  'carrier:write':           ['administrator', 'operations_manager'],
  'delivery-zone:read':      ['administrator', 'operations_manager'],
  'delivery-zone:write':     ['administrator', 'operations_manager'],
  'shipping-template:read':  ['administrator', 'operations_manager'],
  'shipping-template:write': ['administrator', 'operations_manager'],

  // ---- Membership ----
  'membership:read':         ['administrator', 'operations_manager', 'customer_service_agent'],
  'membership:write':        ['administrator', 'operations_manager'],
  'coupon:read':             ['administrator', 'operations_manager', 'customer_service_agent'],
  'coupon:write':            ['administrator', 'operations_manager'],

  // ---- Fulfillment ----
  'fulfillment:read':        ['administrator', 'operations_manager', 'customer_service_agent', 'auditor'],
  'fulfillment:create':      ['administrator', 'operations_manager', 'customer_service_agent'],
  'fulfillment:manage':      ['administrator', 'operations_manager'],

  // ---- Shipments ----
  'shipment:read':           ['administrator', 'operations_manager', 'customer_service_agent', 'auditor'],
  'shipment:write':          ['administrator', 'operations_manager'],
  'shipment:intervene':      ['administrator', 'operations_manager'],

  // ---- After-sales ----
  'after-sales:read':        ['administrator', 'operations_manager', 'customer_service_agent', 'auditor'],
  'after-sales:create':      ['administrator', 'customer_service_agent'],
  'after-sales:manage':      ['administrator', 'operations_manager', 'customer_service_agent'],

  // ---- Compensation ----
  'compensation:suggest':          ['administrator', 'customer_service_agent'],
  'compensation:approve-limited':  ['administrator', 'operations_manager', 'customer_service_agent'],
  'compensation:approve-full':     ['administrator', 'operations_manager'],
  'compensation:approve-override': ['administrator'],

  // ---- Stored value ----
  'stored-value:read':       ['administrator', 'operations_manager'],
  'stored-value:topup':      ['administrator', 'operations_manager'],
  'stored-value:spend':      ['administrator', 'operations_manager', 'customer_service_agent'],

  // ---- Files ----
  'files:upload':            ['administrator', 'operations_manager', 'customer_service_agent'],
  'files:delete':            ['administrator'],

  // ---- Jobs & observability ----
  'jobs:read':               ['administrator', 'operations_manager'],
  'jobs:manage':             ['administrator'],
  'metrics:read':            ['administrator'],
  'logs:read':               ['administrator'],
  'alerts:read':             ['administrator', 'operations_manager'],
  'alerts:manage':           ['administrator'],
};

export function can(role: UserRole, permission: Permission): boolean {
  return PERMISSION_MATRIX[permission]?.includes(role) ?? false;
}

export function getRolePermissions(role: UserRole): Permission[] {
  return (Object.entries(PERMISSION_MATRIX) as [Permission, UserRole[]][])
    .filter(([, roles]) => roles.includes(role))
    .map(([perm]) => perm);
}

export const ROLE_LABELS: Record<UserRole, string> = {
  administrator:           'Administrator',
  operations_manager:      'Operations Manager',
  classroom_supervisor:    'Classroom Supervisor',
  customer_service_agent:  'Customer Service Agent',
  auditor:                 'Auditor',
};
