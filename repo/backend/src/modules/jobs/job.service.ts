import { prisma } from '../../lib/prisma';
import type { JobStatus } from '../../types';

export interface JobListParams {
  queueName?: string;
  status?: JobStatus;
  actorId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

export async function listJobs(params: JobListParams) {
  const page  = Math.max(1, params.page  ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 25));
  const skip  = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (params.queueName) where['queueName'] = { contains: params.queueName };
  if (params.status)    where['status']    = params.status;
  if (params.actorId)   where['actorId']   = params.actorId;
  if (params.from || params.to) {
    where['createdAt'] = {
      ...(params.from && { gte: params.from }),
      ...(params.to   && { lte: params.to }),
    };
  }

  const [jobs, total] = await prisma.$transaction([
    prisma.jobRecord.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.jobRecord.count({ where }),
  ]);

  return {
    data: jobs.map(serializeJob),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getJobById(id: string) {
  const job = await prisma.jobRecord.findUnique({ where: { id } });
  return job ? serializeJob(job) : null;
}

export async function getJobByIdempotencyKey(key: string) {
  const job = await prisma.jobRecord.findUnique({ where: { idempotencyKey: key } });
  return job ? serializeJob(job) : null;
}

export async function createJobRecord(data: {
  queueName: string;
  jobName: string;
  actorId?: string;
  idempotencyKey?: string;
  inputFilename?: string;
  totalRows?: number;
}) {
  return prisma.jobRecord.create({ data });
}

export async function updateJobRecord(id: string, data: {
  status?: JobStatus;
  progress?: number;
  totalRows?: number;
  processedRows?: number;
  failedRows?: number;
  bullJobId?: string;
  result?: string;
  errorMsg?: string;
  startedAt?: Date;
  finishedAt?: Date;
  attempts?: number;
}) {
  return prisma.jobRecord.update({ where: { id }, data });
}

export interface SerializedJob {
  id: string;
  queueName: string;
  jobName: string;
  bullJobId: string | null;
  status: string;
  progress: number;
  totalRows: number | null;
  processedRows: number | null;
  failedRows: number | null;
  actorId: string | null;
  inputFilename: string | null;
  result: Record<string, unknown> | null;
  hasErrorReport: boolean;
  errorMsg: string | null;
  attempts: number;
  maxAttempts: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function serializeJob(job: {
  id: string; queueName: string; jobName: string; bullJobId: string | null;
  status: string; progress: number; totalRows: number | null; processedRows: number | null;
  failedRows: number | null; actorId: string | null; inputFilename: string | null;
  result: string | null; errorMsg: string | null; attempts: number; maxAttempts: number;
  startedAt: Date | null; finishedAt: Date | null; createdAt: Date; updatedAt: Date;
}): SerializedJob {
  let parsedResult: Record<string, unknown> | null = null;
  let hasErrorReport = false;
  if (job.result) {
    try {
      parsedResult = JSON.parse(job.result) as Record<string, unknown>;
      hasErrorReport = !!(parsedResult['errorReportPath']);
    } catch { /* ignore */ }
  }

  return {
    id: job.id,
    queueName: job.queueName,
    jobName: job.jobName,
    bullJobId: job.bullJobId,
    status: job.status,
    progress: job.progress,
    totalRows: job.totalRows,
    processedRows: job.processedRows,
    failedRows: job.failedRows,
    actorId: job.actorId,
    inputFilename: job.inputFilename,
    result: parsedResult,
    hasErrorReport,
    errorMsg: job.errorMsg,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
