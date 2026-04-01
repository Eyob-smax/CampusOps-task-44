import { apiClient } from './client';

// ---- Types ----
export type TicketType = 'delay' | 'dispute' | 'lost_item';
export type TicketStatus = 'open' | 'under_review' | 'pending_approval' | 'resolved' | 'closed';
export type SlaStatus = 'within_sla' | 'at_risk' | 'breached' | 'closed';
export type CompensationType = 'credit' | 'refund' | 'replacement';
export type CompensationStatus = 'suggested' | 'approved' | 'rejected' | 'applied';

export interface TicketTimelineEntry {
  id: string;
  ticketId: string;
  actorId: string | null;
  action: string;
  note: string | null;
  createdAt: string;
}

export interface TicketEvidence {
  id: string;
  ticketId: string;
  type: 'photo' | 'text';
  filePath: string | null;
  fileHash: string | null;
  textNote: string | null;
  uploadedAt: string;
}

export interface Compensation {
  id: string;
  ticketId: string;
  amount: number;
  type: CompensationType;
  status: CompensationStatus;
  approvedById: string | null;
  approvedAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AfterSalesTicket {
  id: string;
  studentId: string;
  student?: { id: string; studentNumber: string; fullName: string };
  shipmentId: string | null;
  shipment?: { id: string; status: string } | null;
  parcelId: string | null;
  parcel?: { id: string; trackingNumber: string } | null;
  type: TicketType;
  status: TicketStatus;
  description: string;
  slaDeadlineAt: string;
  slaStatus: SlaStatus;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  timeline?: TicketTimelineEntry[];
  evidenceFiles?: TicketEvidence[];
  compensations?: Compensation[];
}

export interface TicketListResponse {
  success: boolean;
  data: { total: number; page: number; limit: number; items: AfterSalesTicket[] };
}

// ---- After-Sales Ticket API ----
export const afterSalesApi = {
  list: (params?: {
    studentId?: string; type?: string; status?: string;
    page?: number; limit?: number;
  }) =>
    apiClient.get<TicketListResponse>('/api/after-sales', { params }),

  getById: (id: string) =>
    apiClient.get<{ success: boolean; data: AfterSalesTicket }>(`/api/after-sales/${id}`),

  create: (data: {
    studentId: string; type: TicketType; description: string;
    shipmentId?: string; parcelId?: string;
  }) =>
    apiClient.post<{ success: boolean; data: AfterSalesTicket }>('/api/after-sales', data),

  updateStatus: (id: string, status: TicketStatus, note?: string) =>
    apiClient.patch<{ success: boolean; data: AfterSalesTicket }>(`/api/after-sales/${id}/status`, { status, note }),

  uploadEvidence: (id: string, file: File, cropRect?: { x: number; y: number; width: number; height: number }) => {
    const form = new FormData();
    form.append('file', file);
    if (cropRect) form.append('cropRect', JSON.stringify(cropRect));
    return apiClient.post<{ success: boolean; data: TicketEvidence }>(`/api/after-sales/${id}/evidence/image`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  addTextEvidence: (id: string, note: string) =>
    apiClient.post<{ success: boolean; data: TicketEvidence }>(`/api/after-sales/${id}/evidence/text`, { note }),

  listCompensations: (id: string) =>
    apiClient.get<{ success: boolean; data: Compensation[] }>(`/api/after-sales/${id}/compensations`),

  suggestCompensation: (id: string) =>
    apiClient.post<{ success: boolean; data: Compensation }>(`/api/after-sales/${id}/compensations/suggest`, {}),

  approveCompensation: (ticketId: string, compensationId: string, note?: string) =>
    apiClient.patch<{ success: boolean; data: Compensation }>(
      `/api/after-sales/${ticketId}/compensations/${compensationId}/approve`,
      { note }
    ),

  rejectCompensation: (ticketId: string, compensationId: string, note?: string) =>
    apiClient.patch<{ success: boolean; data: Compensation }>(
      `/api/after-sales/${ticketId}/compensations/${compensationId}/reject`,
      { note }
    ),
};
