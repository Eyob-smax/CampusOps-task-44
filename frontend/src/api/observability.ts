import { apiClient } from './client';

// ---- Types ----
export interface MetricSnapshot {
  id: string;
  metricName: string;
  value: number;
  labels: string | null;
  capturedAt: string;
}

export interface AlertThreshold {
  id: string;
  metricName: string;
  operator: '>' | '<' | '>=' | '<=' | '==';
  value: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AlertHistoryEntry {
  id: string;
  metricName: string;
  value: number;
  threshold: number;
  message: string;
  isAcknowledged: boolean;
  acknowledgedAt: string | null;
  createdAt: string;
}

export interface BackupRecord {
  id: string;
  fileName: string;
  filePath: string;
  sizeBytes: string | null;
  status: 'running' | 'completed' | 'failed';
  verifyStatus: 'pending' | 'passed' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  errorMsg: string | null;
  createdAt: string;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  correlationId?: string;
  actor?: string;
  domain?: string;
  service?: string;
  [key: string]: unknown;
}

export interface LogSearchResponse {
  success: boolean;
  data: { total: number; page: number; limit: number; items: LogEntry[] };
}

// ---- Metrics API ----
export const metricsApi = {
  getLatest: () =>
    apiClient.get<{ success: boolean; data: MetricSnapshot[] }>('/api/metrics'),

  getHistory: (name: string, params?: { from?: string; to?: string; limit?: number }) =>
    apiClient.get<{ success: boolean; data: MetricSnapshot[] }>(`/api/metrics/${encodeURIComponent(name)}/history`, { params }),
};

// ---- Alert Thresholds API ----
export const thresholdApi = {
  list: () =>
    apiClient.get<{ success: boolean; data: AlertThreshold[] }>('/api/thresholds'),

  create: (data: { metricName: string; operator: string; value: number; isActive?: boolean }) =>
    apiClient.post<{ success: boolean; data: AlertThreshold }>('/api/thresholds', data),

  update: (id: string, data: Partial<{ metricName: string; operator: string; value: number; isActive: boolean }>) =>
    apiClient.put<{ success: boolean; data: AlertThreshold }>(`/api/thresholds/${id}`, data),

  delete: (id: string) =>
    apiClient.delete(`/api/thresholds/${id}`),
};

// ---- Alert History API ----
export const alertHistoryApi = {
  list: (params?: { acknowledged?: boolean; from?: string; to?: string; page?: number; limit?: number }) =>
    apiClient.get<{ success: boolean; data: { total: number; items: AlertHistoryEntry[] } }>('/api/alerts', { params }),

  acknowledge: (id: string) =>
    apiClient.patch<{ success: boolean; data: AlertHistoryEntry }>(`/api/alerts/${id}/acknowledge`, {}),
};

// ---- Backup API ----
export const backupApi = {
  list: (params?: { status?: string; page?: number; limit?: number }) =>
    apiClient.get<{ success: boolean; data: { total: number; items: BackupRecord[] } }>('/api/backups', { params }),

  getById: (id: string) =>
    apiClient.get<{ success: boolean; data: BackupRecord }>(`/api/backups/${id}`),

  trigger: () =>
    apiClient.post<{ success: boolean; data: BackupRecord }>('/api/backups', {}),

  verify: (id: string) =>
    apiClient.post<{ success: boolean; data: { passed: boolean; details: string } }>(`/api/backups/${id}/verify`, {}),
};

// ---- Log Search API ----
export const logApi = {
  search: (params?: {
    service?: string; severity?: string; correlationId?: string;
    actor?: string; domain?: string; from?: string; to?: string;
    search?: string; page?: number; limit?: number;
  }) =>
    apiClient.get<LogSearchResponse>('/api/logs', { params }),
};
