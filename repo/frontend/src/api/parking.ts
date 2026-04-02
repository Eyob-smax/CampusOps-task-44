import { apiClient } from './client';

// ---- Types ----
export type ParkingAlertStatus = 'open' | 'claimed' | 'closed' | 'escalated';
export type ParkingAlertType   = 'no_plate_captured' | 'overtime' | 'unsettled_session' | 'duplicate_plate' | 'inconsistent_entry_exit';
export type SlaSatus           = 'within_sla' | 'at_risk' | 'breached' | 'closed';

export interface ParkingLot {
  id: string; name: string; totalSpaces: number;
  occupiedSpaces: number; availableSpaces: number;
  occupancyPct: number; activeAlerts: number; isActive: boolean;
}

export interface ParkingLotStats extends ParkingLot {
  entriesLastHour: number; turnoverRate: number; avgDwellMinutes: number;
}

export interface ParkingDashboard {
  totalLots: number; totalSpaces: number; occupiedSpaces: number;
  availableSpaces: number; occupancyPct: number;
  activeAlerts: number; escalatedAlerts: number;
  lots: ParkingLot[];
}

export interface ParkingSession {
  id: string; lotId: string; plateNumber: string | null;
  entryAt: string; exitAt: string | null; isSettled: boolean;
}

export interface ParkingAlertTimelineEntry {
  id: string; alertId: string; actorId: string | null;
  action: string; note: string | null; createdAt: string;
}

export interface ParkingAlert {
  id: string; lotId: string; type: ParkingAlertType;
  status: ParkingAlertStatus; description: string;
  claimedById: string | null; claimedBy: { id: string; username: string } | null;
  claimedAt: string | null;
  closedById: string | null; closedBy: { id: string; username: string } | null;
  closureNote: string | null; escalatedAt: string | null; closedAt: string | null;
  slaDeadlineAt: string | null; slaStatus: SlaSatus;
  ageSeconds: number; msToSlaDeadline: number | null;
  createdAt: string; updatedAt: string;
  lot?: { id: string; name: string; totalSpaces: number };
  timeline?: ParkingAlertTimelineEntry[];
}

export interface AlertMetrics {
  openAlerts: number; escalatedAlerts: number;
  creationRatePerHour: number; meanTimeToCloseMin: number; totalClosed: number;
}

// ---- Parking API ----
export const parkingApi = {
  dashboard: () =>
    apiClient.get<{ success: boolean; data: ParkingDashboard }>('/api/parking/dashboard'),
  lots: (params?: { search?: string; active?: boolean }) =>
    apiClient.get<{ success: boolean; data: ParkingLot[] }>('/api/parking/lots', { params }),
  lotStats: (id: string) =>
    apiClient.get<{ success: boolean; data: ParkingLotStats }>(`/api/parking/lots/${id}/stats`),
  sessions: (params?: { lotId?: string; active?: boolean; plateNumber?: string; page?: number; limit?: number }) =>
    apiClient.get('/api/parking/sessions', { params }),
  recordEntry: (data: { lotId: string; plateNumber?: string }) =>
    apiClient.post('/api/parking/sessions/entry', data),
  recordExit: (sessionId: string) =>
    apiClient.post('/api/parking/sessions/exit', { sessionId }),
};

// ---- Alert API ----
export const parkingAlertApi = {
  list: (params?: { lotId?: string; status?: string; type?: string; from?: string; to?: string; page?: number; limit?: number }) =>
    apiClient.get<{ success: boolean; data: ParkingAlert[]; total: number }>('/api/parking-alerts', { params }),
  getById: (id: string) =>
    apiClient.get<{ success: boolean; data: ParkingAlert }>(`/api/parking-alerts/${id}`),
  create: (data: { lotId: string; type: ParkingAlertType; description: string }) =>
    apiClient.post<{ success: boolean; data: ParkingAlert }>('/api/parking-alerts', data),
  claim: (id: string) =>
    apiClient.patch<{ success: boolean; data: ParkingAlert }>(`/api/parking-alerts/${id}/claim`, {}),
  close: (id: string, closureNote: string) =>
    apiClient.patch<{ success: boolean; data: ParkingAlert }>(`/api/parking-alerts/${id}/close`, { closureNote }),
  escalate: (id: string, note?: string) =>
    apiClient.patch<{ success: boolean; data: ParkingAlert }>(`/api/parking-alerts/${id}/escalate`, { note }),
  metrics: (lotId?: string) =>
    apiClient.get<{ success: boolean; data: AlertMetrics }>('/api/parking-alerts/metrics', { params: { lotId } }),
};
