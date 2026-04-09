import { apiClient } from './client';

// ---- Types ----
export type FulfillmentStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export interface FulfillmentItem {
  id: string;
  fulfillmentRequestId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  weightLb: number | null;
}

export interface FulfillmentRequest {
  id: string;
  studentId: string;
  student: { id: string; studentNumber: string; fullName: string } | null;
  status: FulfillmentStatus;
  couponId: string | null;
  coupon: { id: string; code: string } | null;
  subtotal: number;
  discountAmount: number;
  shippingFee: number;
  totalAmount: number;
  storedValueUsed: number;
  pointsEarned: number;
  receiptNumber: string;
  notes: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
  items: FulfillmentItem[];
}

export interface CreateFulfillmentData {
  studentId: string;
  items: { description: string; quantity: number; unitPrice: number; weightLb?: number }[];
  couponCode?: string;
  notes?: string;
  storedValueAmount?: number;
  zoneId?: string;
  tier?: string;
  idempotencyKey?: string;
}

export interface FulfillmentListResponse {
  success: boolean;
  data: { total: number; page: number; limit: number; items: FulfillmentRequest[] };
}

// ---- Fulfillment API ----
export const fulfillmentApi = {
  list: (params?: {
    studentId?: string; status?: string;
    startDate?: string; endDate?: string;
    page?: number; limit?: number;
  }) =>
    apiClient.get<FulfillmentListResponse>('/api/fulfillment', { params }),

  getById: (id: string) =>
    apiClient.get<{ success: boolean; data: FulfillmentRequest }>(`/api/fulfillment/${id}`),

  create: (data: CreateFulfillmentData) =>
    apiClient.post<{ success: boolean; data: FulfillmentRequest }>('/api/fulfillment', data),

  updateStatus: (id: string, status: FulfillmentStatus) =>
    apiClient.patch<{ success: boolean; data: FulfillmentRequest }>(`/api/fulfillment/${id}/status`, { status }),

  cancel: (id: string) =>
    apiClient.patch<{ success: boolean; data: FulfillmentRequest }>(`/api/fulfillment/${id}/cancel`, {}),
};
