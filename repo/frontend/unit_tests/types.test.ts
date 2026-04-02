import { describe, it, expect } from 'vitest';
import type {
  UserRole,
  AuthUser,
  ClassroomStatus,
  AnomalyEventStatus,
  ParkingAlertStatus,
  FulfillmentStatus,
  ShipmentStatus,
  AfterSalesTicketType,
  AfterSalesTicketStatus,
  JobStatus,
  ApiResponse,
  PaginatedResult,
} from '../src/types';

// ---------------------------------------------------------------------------
// These tests verify that the TypeScript types compile correctly and that
// representative values are assignable. Since types are erased at runtime,
// we assert on concrete objects that conform to each type.
// ---------------------------------------------------------------------------

describe('Types — compile-time & runtime sanity', () => {
  // -----------------------------------------------------------------------
  // UserRole
  // -----------------------------------------------------------------------
  describe('UserRole', () => {
    const validRoles: UserRole[] = [
      'administrator',
      'operations_manager',
      'classroom_supervisor',
      'customer_service_agent',
      'auditor',
    ];

    it('accepts all 5 valid role strings', () => {
      expect(validRoles).toHaveLength(5);
      validRoles.forEach((r) => expect(typeof r).toBe('string'));
    });

    it('each role is a non-empty string', () => {
      validRoles.forEach((r) => expect(r.length).toBeGreaterThan(0));
    });
  });

  // -----------------------------------------------------------------------
  // AuthUser
  // -----------------------------------------------------------------------
  describe('AuthUser', () => {
    it('has required fields id, username, role', () => {
      const user: AuthUser = { id: '1', username: 'admin', role: 'administrator' };
      expect(user.id).toBe('1');
      expect(user.username).toBe('admin');
      expect(user.role).toBe('administrator');
    });
  });

  // -----------------------------------------------------------------------
  // ClassroomStatus
  // -----------------------------------------------------------------------
  describe('ClassroomStatus', () => {
    it('accepts online, offline, degraded', () => {
      const statuses: ClassroomStatus[] = ['online', 'offline', 'degraded'];
      expect(statuses).toHaveLength(3);
    });
  });

  // -----------------------------------------------------------------------
  // AnomalyEventStatus
  // -----------------------------------------------------------------------
  describe('AnomalyEventStatus', () => {
    it('has expected values', () => {
      const statuses: AnomalyEventStatus[] = [
        'open', 'acknowledged', 'assigned', 'resolved', 'escalated',
      ];
      expect(statuses).toHaveLength(5);
    });
  });

  // -----------------------------------------------------------------------
  // ParkingAlertStatus
  // -----------------------------------------------------------------------
  describe('ParkingAlertStatus', () => {
    it('has expected values', () => {
      const statuses: ParkingAlertStatus[] = ['open', 'claimed', 'closed', 'escalated'];
      expect(statuses).toHaveLength(4);
    });
  });

  // -----------------------------------------------------------------------
  // FulfillmentStatus
  // -----------------------------------------------------------------------
  describe('FulfillmentStatus', () => {
    it('has 6 lifecycle statuses', () => {
      const statuses: FulfillmentStatus[] = [
        'draft', 'pending', 'processing', 'shipped', 'delivered', 'cancelled',
      ];
      expect(statuses).toHaveLength(6);
    });
  });

  // -----------------------------------------------------------------------
  // ShipmentStatus
  // -----------------------------------------------------------------------
  describe('ShipmentStatus', () => {
    it('has expected values', () => {
      const statuses: ShipmentStatus[] = [
        'pending', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'returned',
      ];
      expect(statuses).toHaveLength(6);
    });
  });

  // -----------------------------------------------------------------------
  // AfterSalesTicketType
  // -----------------------------------------------------------------------
  describe('AfterSalesTicketType', () => {
    it('has delay, dispute, lost_item', () => {
      const types: AfterSalesTicketType[] = ['delay', 'dispute', 'lost_item'];
      expect(types).toHaveLength(3);
    });
  });

  // -----------------------------------------------------------------------
  // AfterSalesTicketStatus
  // -----------------------------------------------------------------------
  describe('AfterSalesTicketStatus', () => {
    it('has expected values', () => {
      const statuses: AfterSalesTicketStatus[] = [
        'open', 'under_review', 'pending_approval', 'resolved', 'closed',
      ];
      expect(statuses).toHaveLength(5);
    });
  });

  // -----------------------------------------------------------------------
  // JobStatus
  // -----------------------------------------------------------------------
  describe('JobStatus', () => {
    it('has expected values', () => {
      const statuses: JobStatus[] = ['waiting', 'active', 'completed', 'failed', 'delayed'];
      expect(statuses).toHaveLength(5);
    });
  });

  // -----------------------------------------------------------------------
  // ApiResponse
  // -----------------------------------------------------------------------
  describe('ApiResponse', () => {
    it('success response', () => {
      const res: ApiResponse<string> = { success: true, data: 'hello' };
      expect(res.success).toBe(true);
      expect(res.data).toBe('hello');
    });

    it('error response', () => {
      const res: ApiResponse = { success: false, error: 'Not found' };
      expect(res.success).toBe(false);
      expect(res.error).toBe('Not found');
    });
  });

  // -----------------------------------------------------------------------
  // PaginatedResult
  // -----------------------------------------------------------------------
  describe('PaginatedResult', () => {
    it('has data array with pagination metadata', () => {
      const page: PaginatedResult<number> = {
        data: [1, 2, 3],
        total: 30,
        page: 1,
        limit: 10,
        totalPages: 3,
      };
      expect(page.data).toHaveLength(3);
      expect(page.totalPages).toBe(3);
    });
  });
});
