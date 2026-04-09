// ============================================================
// Shared domain types used across the backend
// ============================================================

export type UserRole =
  | 'administrator'
  | 'operations_manager'
  | 'classroom_supervisor'
  | 'customer_service_agent'
  | 'auditor';

export type ClassroomStatus = 'online' | 'offline' | 'degraded';

export type AnomalyEventStatus = 'open' | 'acknowledged' | 'assigned' | 'resolved' | 'escalated';

export type ParkingAlertType =
  | 'no_plate_captured'
  | 'overtime'
  | 'unsettled_session'
  | 'duplicate_plate'
  | 'inconsistent_entry_exit';

export type ParkingAlertStatus = 'open' | 'claimed' | 'closed' | 'escalated';

export type FulfillmentStatus =
  | 'pending'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export type ShipmentStatus =
  | 'pending'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'exception'
  | 'returned';

export type AfterSalesTicketType = 'delay' | 'dispute' | 'lost_item';

export type AfterSalesTicketStatus =
  | 'open'
  | 'under_review'
  | 'pending_approval'
  | 'resolved'
  | 'closed';

export type CompensationStatus = 'suggested' | 'approved' | 'rejected' | 'applied';

export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: UserRole;
  campusId: string;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
