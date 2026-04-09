// ============================================================
// Shared frontend domain types
// ============================================================

export type UserRole =
  | 'administrator'
  | 'operations_manager'
  | 'classroom_supervisor'
  | 'customer_service_agent'
  | 'auditor';

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  campusId?: string;
}

export type ClassroomStatus = 'online' | 'offline' | 'degraded';
export type AnomalyEventStatus = 'open' | 'acknowledged' | 'assigned' | 'resolved' | 'escalated';
export type ParkingAlertStatus = 'open' | 'claimed' | 'closed' | 'escalated';
export type FulfillmentStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type ShipmentStatus = 'pending' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'returned';
export type AfterSalesTicketType = 'delay' | 'dispute' | 'lost_item';
export type AfterSalesTicketStatus = 'open' | 'under_review' | 'pending_approval' | 'resolved' | 'closed';
export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
