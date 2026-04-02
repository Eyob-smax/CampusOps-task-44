import { apiClient } from './client';

export interface JobRecord {
  id: string;
  queueName: string;
  jobName: string;
  bullJobId: string | null;
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  progress: number;
  totalRows: number | null;
  processedRows: number | null;
  failedRows: number | null;
  actorId: string | null;
  inputFilename: string | null;
  result: {
    created?: number;
    updated?: number;
    failed?: number;
    totalErrors?: number;
    errorReportPath?: string;
  } | null;
  hasErrorReport: boolean;
  errorMsg: string | null;
  attempts: number;
  maxAttempts: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobListResult {
  data: JobRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const jobsApi = {
  list: (params?: {
    queue?: string;
    status?: string;
    actorId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) => apiClient.get<{ data: JobListResult }>('/api/jobs', { params }),

  getById: (id: string) =>
    apiClient.get<{ data: JobRecord }>(`/api/jobs/${id}`),

  downloadErrorReport: (id: string) =>
    apiClient.get(`/api/jobs/${id}/error-report`, { responseType: 'blob' }),

  retry: (id: string, idempotencyKey: string) =>
    apiClient.post<{ data: JobRecord }>(`/api/jobs/${id}/retry`, {}, {
      headers: { 'X-Idempotency-Key': idempotencyKey },
    }),
};
