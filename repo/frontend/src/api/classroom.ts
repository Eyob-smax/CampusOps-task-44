import { apiClient } from './client';

// ---- Classroom types ----
export type ClassroomStatus = 'online' | 'offline' | 'degraded';

export interface ClassroomClass {
  id: string;
  name: string;
  roomNumber: string | null;
  course?: { id: string; code: string; name: string };
  department?: { id: string; name: string; code: string };
  semester?: { id: string; name: string };
}

export interface Classroom {
  id: string;
  hardwareNodeId: string;
  status: ClassroomStatus;
  recognitionConfidence: number | null;
  confidenceThreshold: number;
  lastHeartbeatAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  class?: ClassroomClass;
  openAnomalyCount: number;
}

export interface ClassroomStats {
  total: number;
  online: number;
  offline: number;
  degraded: number;
  activeAnomalies: number;
}

export interface ClassroomListResult {
  data: Classroom[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ---- Anomaly types ----
export type AnomalyStatus = 'open' | 'acknowledged' | 'assigned' | 'resolved' | 'escalated';

export interface AnomalyTimelineEntry {
  id: string;
  anomalyId: string;
  actorId: string | null;
  action: string;
  note: string | null;
  createdAt: string;
}

export interface AnomalyUser {
  id: string;
  username: string;
}

export interface AnomalyClassroom {
  id: string;
  hardwareNodeId: string;
  class?: { name: string; roomNumber: string | null; department?: { name: string; code: string } };
}

export interface Anomaly {
  id: string;
  classroomId: string;
  type: string;
  description: string;
  status: AnomalyStatus;
  acknowledgedById: string | null;
  acknowledgedBy: AnomalyUser | null;
  acknowledgedAt: string | null;
  assignedToId: string | null;
  assignedTo: AnomalyUser | null;
  resolvedById: string | null;
  resolvedBy: AnomalyUser | null;
  resolutionNote: string | null;
  escalatedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  classroom?: AnomalyClassroom;
  timeline?: AnomalyTimelineEntry[];
}

export interface AnomalyListResult {
  data: Anomaly[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ---- Classroom API ----
export const classroomApi = {
  list: (params?: { departmentId?: string; status?: ClassroomStatus; search?: string; page?: number; limit?: number }) =>
    apiClient.get<{ success: boolean } & ClassroomListResult>('/api/classrooms', { params }),

  stats: () =>
    apiClient.get<{ success: boolean; data: ClassroomStats }>('/api/classrooms/stats'),

  getById: (id: string) =>
    apiClient.get<{ success: boolean; data: Classroom }>(`/api/classrooms/${id}`),

  heartbeat: (nodeId: string, data: { recognitionConfidence?: number }) =>
    apiClient.post(`/api/classrooms/heartbeat/${nodeId}`, data),
};

// ---- Anomaly API ----
export const anomalyApi = {
  list: (params?: {
    classroomId?: string;
    status?: string;
    type?: string;
    search?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) => apiClient.get<{ success: boolean } & AnomalyListResult>('/api/anomalies', { params }),

  getById: (id: string) =>
    apiClient.get<{ success: boolean; data: Anomaly }>(`/api/anomalies/${id}`),

  create: (data: { classroomId: string; type: string; description: string }) =>
    apiClient.post<{ success: boolean; data: Anomaly }>('/api/anomalies', data),

  acknowledge: (id: string) =>
    apiClient.patch<{ success: boolean; data: Anomaly }>(`/api/anomalies/${id}/acknowledge`, {}),

  assign: (id: string, data: { assignedToId: string; note?: string }) =>
    apiClient.patch<{ success: boolean; data: Anomaly }>(`/api/anomalies/${id}/assign`, data),

  resolve: (id: string, data: { resolutionNote: string }) =>
    apiClient.patch<{ success: boolean; data: Anomaly }>(`/api/anomalies/${id}/resolve`, data),

  escalate: (id: string, data?: { note?: string }) =>
    apiClient.patch<{ success: boolean; data: Anomaly }>(`/api/anomalies/${id}/escalate`, data ?? {}),
};
