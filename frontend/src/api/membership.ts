import { apiClient } from './client';

// ---- Types ----
export interface MembershipTier {
  id: string;
  name: string;
  discountPercent: number;
  pointThreshold: number;
  benefits: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CouponDiscountType = 'flat' | 'percent';

export interface Coupon {
  id: string;
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  minimumOrderValue: number | null;
  tierId: string | null;
  isSingleUse: boolean;
  maxUsage: number | null;
  usageCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoredValueTransaction {
  id: string;
  studentId: string;
  type: 'top_up' | 'spend' | 'refund';
  amountEncrypted: string;
  balanceAfterEncrypted: string;
  referenceId: string | null;
  referenceType: string | null;
  note: string | null;
  createdAt: string;
}

export interface StoredValueBalance {
  balance: number;
}

// ---- Membership Tier API ----
export const membershipApi = {
  listTiers: () =>
    apiClient.get<{ success: boolean; data: MembershipTier[] }>('/api/membership/tiers'),
  getTier: (id: string) =>
    apiClient.get<{ success: boolean; data: MembershipTier }>(`/api/membership/tiers/${id}`),
  createTier: (data: { name: string; discountPercent: number; pointThreshold: number; benefits: string; isActive?: boolean }) =>
    apiClient.post<{ success: boolean; data: MembershipTier }>('/api/membership/tiers', data),
  updateTier: (id: string, data: Partial<{ name: string; discountPercent: number; pointThreshold: number; benefits: string; isActive: boolean }>) =>
    apiClient.put<{ success: boolean; data: MembershipTier }>(`/api/membership/tiers/${id}`, data),
};

// ---- Coupon API ----
export const couponApi = {
  list: () =>
    apiClient.get<{ success: boolean; data: Coupon[] }>('/api/coupons'),
  getById: (id: string) =>
    apiClient.get<{ success: boolean; data: Coupon }>(`/api/coupons/${id}`),
  create: (data: {
    code: string; discountType: CouponDiscountType; discountValue: number;
    minimumOrderValue?: number; tierId?: string; isSingleUse?: boolean;
    maxUsage?: number; expiresAt?: string;
  }) =>
    apiClient.post<{ success: boolean; data: Coupon }>('/api/coupons', data),
  update: (id: string, data: Partial<{
    code: string; discountType: CouponDiscountType; discountValue: number;
    minimumOrderValue: number; tierId: string | null; isSingleUse: boolean;
    maxUsage: number | null; expiresAt: string | null; isActive: boolean;
  }>) =>
    apiClient.put<{ success: boolean; data: Coupon }>(`/api/coupons/${id}`, data),
  validate: (data: { code: string; studentTierId?: string; orderSubtotal: number }) =>
    apiClient.post<{ success: boolean; data: { coupon: Coupon; discountAmount: number } }>('/api/coupons/validate', data),
};

// ---- Stored Value API ----
export const storedValueApi = {
  getBalance: (studentId: string) =>
    apiClient.get<{ success: boolean; data: StoredValueBalance }>(`/api/stored-value/${studentId}/balance`),
  topUp: (studentId: string, data: { amount: number; note?: string }) =>
    apiClient.post<{ success: boolean; data: { balance: number; transaction: StoredValueTransaction } }>(`/api/stored-value/${studentId}/top-up`, data),
  spend: (studentId: string, data: { amount: number; referenceId: string; referenceType: string }) =>
    apiClient.post<{ success: boolean; data: { balance: number; transaction: StoredValueTransaction } }>(`/api/stored-value/${studentId}/spend`, data),
  listTransactions: (studentId: string, params?: { page?: number; limit?: number; type?: string }) =>
    apiClient.get<{ success: boolean; data: { total: number; page: number; limit: number; items: StoredValueTransaction[] } }>(`/api/stored-value/${studentId}/transactions`, { params }),
  getReceipt: (transactionId: string) =>
    apiClient.get<{ success: boolean; data: string }>(`/api/stored-value/transactions/${transactionId}/receipt`),
};
