import { apiClient } from "./client";

// ---- User management ----
export interface AdminUser {
  id: string;
  username: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserPayload {
  username: string;
  password: string;
  role: string;
}

export const userApi = {
  list(): Promise<AdminUser[]> {
    return apiClient.get("/api/admin/users");
  },
  get(id: string): Promise<AdminUser> {
    return apiClient.get(`/api/admin/users/${id}`);
  },
  create(payload: CreateUserPayload): Promise<AdminUser> {
    return apiClient.post("/api/admin/users", payload);
  },
  update(id: string, payload: Partial<AdminUser>): Promise<AdminUser> {
    return apiClient.patch(`/api/admin/users/${id}`, payload);
  },
  changeRole(id: string, role: string): Promise<AdminUser> {
    return apiClient.patch(`/api/admin/users/${id}/role`, { role });
  },
  resetPassword(id: string, newPassword: string): Promise<void> {
    return apiClient.post(`/api/admin/users/${id}/reset-password`, {
      newPassword,
    });
  },
  deactivate(id: string): Promise<void> {
    return apiClient.delete(`/api/admin/users/${id}`);
  },
};

// ---- Audit logs ----
export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorUsername: string;
  action: string;
  entityType: string;
  entityId: string;
  detail: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditSearchParams {
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  reveal?: "true" | "false";
}

export const auditApi = {
  search(
    params: AuditSearchParams,
  ): Promise<{ data: AuditLogEntry[]; total: number }> {
    return apiClient.get("/api/admin/audit", { params });
  },
  reveal(id: string, justification: string): Promise<AuditLogEntry> {
    return apiClient.post(`/api/admin/audit/reveal/${id}`, { justification });
  },
};

// ---- Settings ----
export interface AlertThreshold {
  id: string;
  metricName: string;
  operator: string;
  value: number;
  isActive: boolean;
}

export const settingsApi = {
  getAll(): Promise<Record<string, string>> {
    return apiClient.get("/api/admin/settings");
  },
  update(updates: Record<string, string>): Promise<void> {
    return apiClient.patch("/api/admin/settings", updates);
  },
  getThresholds(): Promise<AlertThreshold[]> {
    return apiClient.get("/api/admin/settings/thresholds");
  },
  upsertThreshold(data: Omit<AlertThreshold, "id">): Promise<AlertThreshold> {
    return apiClient.put("/api/admin/settings/thresholds", data);
  },
  getBackups(): Promise<unknown[]> {
    return apiClient.get("/api/admin/settings/backups");
  },
};

// ---- Integration keys ----
export interface IntegrationKey {
  id: string;
  name: string;
  keyId: string;
  scope: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export const integrationKeyApi = {
  list(): Promise<IntegrationKey[]> {
    return apiClient.get("/api/admin/settings/keys");
  },
  create(
    name: string,
    scope: string,
  ): Promise<{ keyId: string; secret: string; id: string }> {
    return apiClient.post("/api/admin/settings/keys", { name, scope });
  },
  rotate(id: string): Promise<{ keyId: string; secret: string }> {
    return apiClient.post(`/api/admin/settings/keys/${id}/rotate`);
  },
  deactivate(id: string): Promise<void> {
    return apiClient.delete(`/api/admin/settings/keys/${id}`);
  },
};
