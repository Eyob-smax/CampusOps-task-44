import { apiClient } from './client';

// ---- Types ----
export type ShipmentStatus = 'pending' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'returned';

export interface Parcel {
  id: string;
  shipmentId: string;
  trackingNumber: string;
  status: ShipmentStatus;
  weightLb: number | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Shipment {
  id: string;
  fulfillmentRequestId: string;
  warehouseId: string;
  warehouse?: { id: string; name: string };
  carrierId: string;
  carrier?: { id: string; name: string };
  status: ShipmentStatus;
  estimatedDeliveryAt: string | null;
  deliveredAt: string | null;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
  parcels?: Parcel[];
}

export interface ShipmentListResponse {
  success: boolean;
  data: { total: number; page: number; limit: number; items: Shipment[] };
}

// ---- Shipment API ----
export const shipmentApi = {
  list: (params?: {
    carrierId?: string; warehouseId?: string; status?: string;
    fulfillmentRequestId?: string; page?: number; limit?: number;
  }) =>
    apiClient.get<ShipmentListResponse>('/api/shipments', { params }),

  getById: (id: string) =>
    apiClient.get<{ success: boolean; data: Shipment }>(`/api/shipments/${id}`),

  create: (data: {
    fulfillmentRequestId: string; warehouseId: string;
    carrierId: string; estimatedDeliveryAt?: string;
  }) =>
    apiClient.post<{ success: boolean; data: Shipment }>('/api/shipments', data),

  updateStatus: (id: string, status: ShipmentStatus) =>
    apiClient.patch<{ success: boolean; data: Shipment }>(`/api/shipments/${id}/status`, { status }),

  triggerSync: (carrierId: string) =>
    apiClient.post<{ success: boolean; data: { queued: boolean } }>(`/api/shipments/sync/${carrierId}`, {}),
};

// ---- Parcel API ----
export const parcelApi = {
  list: (shipmentId: string) =>
    apiClient.get<{ success: boolean; data: Parcel[] }>('/api/parcels', { params: { shipmentId } }),

  getById: (id: string) =>
    apiClient.get<{ success: boolean; data: Parcel }>(`/api/parcels/${id}`),

  add: (data: { shipmentId: string; trackingNumber: string; weightLb?: number; description?: string }) =>
    apiClient.post<{ success: boolean; data: Parcel }>('/api/parcels', data),

  updateStatus: (id: string, status: ShipmentStatus) =>
    apiClient.patch<{ success: boolean; data: Parcel }>(`/api/parcels/${id}/status`, { status }),
};
