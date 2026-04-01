import { apiClient } from './client';

// ---- Types ----
export interface Warehouse {
  id: string;
  name: string;
  address: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Carrier {
  id: string;
  name: string;
  code: string;
  trackingUrlTemplate: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryZoneZip {
  id: string;
  zoneId: string;
  zipCode: string;
  isNonServiceable: boolean;
}

export interface DeliveryZone {
  id: string;
  name: string;
  regionCode: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  zipCodes: DeliveryZoneZip[];
  shippingTemplates: ShippingFeeTemplate[];
}

export interface ShippingFeeTemplate {
  id: string;
  name: string;
  zoneId: string;
  tier: string;
  baseFee: number;
  baseWeightLb: number;
  perLbFee: number;
  maxItems: number | null;
  perItemFee: number | null;
  surchargeAk: number;
  surchargeHi: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ShippingFeeCalculation {
  fee: number;
  templateId: string;
  weightLb: number;
  itemCount: number;
  regionCode: string;
}

// ---- Warehouse API ----
export const warehouseApi = {
  list: () =>
    apiClient.get<{ success: boolean; data: Warehouse[] }>('/api/warehouses'),
  getById: (id: string) =>
    apiClient.get<{ success: boolean; data: Warehouse }>(`/api/warehouses/${id}`),
  create: (data: { name: string; address: string }) =>
    apiClient.post<{ success: boolean; data: Warehouse }>('/api/warehouses', data),
  update: (id: string, data: Partial<{ name: string; address: string; isActive: boolean }>) =>
    apiClient.put<{ success: boolean; data: Warehouse }>(`/api/warehouses/${id}`, data),
};

// ---- Carrier API ----
export const carrierApi = {
  list: () =>
    apiClient.get<{ success: boolean; data: Carrier[] }>('/api/carriers'),
  getById: (id: string) =>
    apiClient.get<{ success: boolean; data: Carrier }>(`/api/carriers/${id}`),
  create: (data: { name: string; code: string; trackingUrlTemplate?: string }) =>
    apiClient.post<{ success: boolean; data: Carrier }>('/api/carriers', data),
  update: (id: string, data: Partial<{ name: string; code: string; trackingUrlTemplate: string; isActive: boolean }>) =>
    apiClient.put<{ success: boolean; data: Carrier }>(`/api/carriers/${id}`, data),
};

// ---- Delivery Zone API ----
export const deliveryZoneApi = {
  list: () =>
    apiClient.get<{ success: boolean; data: DeliveryZone[] }>('/api/delivery-zones'),
  getById: (id: string) =>
    apiClient.get<{ success: boolean; data: DeliveryZone }>(`/api/delivery-zones/${id}`),
  create: (data: { name: string; regionCode: string; isActive?: boolean }) =>
    apiClient.post<{ success: boolean; data: DeliveryZone }>('/api/delivery-zones', data),
  update: (id: string, data: Partial<{ name: string; regionCode: string; isActive: boolean }>) =>
    apiClient.put<{ success: boolean; data: DeliveryZone }>(`/api/delivery-zones/${id}`, data),
  addZip: (zoneId: string, data: { zipCode: string; isNonServiceable?: boolean }) =>
    apiClient.post<{ success: boolean; data: DeliveryZoneZip }>(`/api/delivery-zones/${zoneId}/zips`, data),
  removeZip: (zoneId: string, zipCode: string) =>
    apiClient.delete(`/api/delivery-zones/${zoneId}/zips/${zipCode}`),
  checkZip: (zipCode: string) =>
    apiClient.get<{ success: boolean; data: { serviceable: boolean; zone: DeliveryZone } }>(`/api/delivery-zones/check/${zipCode}`),
};

// ---- Shipping Template API ----
export const shippingTemplateApi = {
  list: (params?: { zoneId?: string; tier?: string; active?: boolean }) =>
    apiClient.get<{ success: boolean; data: ShippingFeeTemplate[] }>('/api/shipping-templates', { params }),
  getById: (id: string) =>
    apiClient.get<{ success: boolean; data: ShippingFeeTemplate }>(`/api/shipping-templates/${id}`),
  create: (data: {
    name: string; zoneId: string; tier: string;
    baseFee: number; baseWeightLb: number; perLbFee: number;
    maxItems?: number; perItemFee?: number;
    surchargeAk?: number; surchargeHi?: number; isActive?: boolean;
  }) =>
    apiClient.post<{ success: boolean; data: ShippingFeeTemplate }>('/api/shipping-templates', data),
  update: (id: string, data: Partial<{
    name: string; baseFee: number; baseWeightLb: number; perLbFee: number;
    maxItems: number; perItemFee: number; surchargeAk: number; surchargeHi: number; isActive: boolean;
  }>) =>
    apiClient.put<{ success: boolean; data: ShippingFeeTemplate }>(`/api/shipping-templates/${id}`, data),
  calculate: (data: { templateId: string; weightLb: number; itemCount: number; regionCode: string }) =>
    apiClient.post<{ success: boolean; data: ShippingFeeCalculation }>('/api/shipping-templates/calculate', data),
};
