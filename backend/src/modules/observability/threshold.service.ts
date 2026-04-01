import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { writeAuditEntry } from '../admin/audit.service';
import { logger } from '../../lib/logger';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

export const createThresholdSchema = z.object({
  metricName: z.string().min(1),
  operator: z.enum(['>', '<', '>=', '<=', '==']),
  value: z.number(),
  isActive: z.boolean().optional().default(true),
});

export const updateThresholdSchema = z.object({
  metricName: z.string().min(1).optional(),
  operator: z.enum(['>', '<', '>=', '<='  , '==']).optional(),
  value: z.number().optional(),
  isActive: z.boolean().optional(),
});

export type CreateThresholdInput = z.infer<typeof createThresholdSchema>;
export type UpdateThresholdInput = z.infer<typeof updateThresholdSchema>;

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function listThresholds() {
  return prisma.alertThreshold.findMany({
    orderBy: { metricName: 'asc' },
  });
}

export async function getThresholdById(id: string) {
  const threshold = await prisma.alertThreshold.findUnique({ where: { id } });
  if (!threshold) {
    const err: any = new Error('Alert threshold not found');
    err.status = 404;
    err.code = 'THRESHOLD_NOT_FOUND';
    throw err;
  }
  return threshold;
}

export async function createThreshold(data: CreateThresholdInput, actorId: string) {
  const existing = await prisma.alertThreshold.findUnique({
    where: { metricName: data.metricName },
  });
  if (existing) {
    const err: any = new Error(`Threshold for metric "${data.metricName}" already exists`);
    err.status = 409;
    err.code = 'THRESHOLD_DUPLICATE';
    throw err;
  }

  const threshold = await prisma.alertThreshold.create({
    data: {
      metricName: data.metricName,
      operator:   data.operator,
      value:      data.value,
      isActive:   data.isActive ?? true,
    },
  });

  await writeAuditEntry(
    actorId,
    'CREATE_THRESHOLD',
    'AlertThreshold',
    threshold.id,
    { metricName: threshold.metricName, operator: threshold.operator, value: threshold.value },
  );

  logger.info({ msg: 'Alert threshold created', id: threshold.id, metricName: threshold.metricName });
  return threshold;
}

export async function updateThreshold(id: string, data: UpdateThresholdInput, actorId: string) {
  await getThresholdById(id); // throws 404 if not found

  if (data.metricName) {
    const collision = await prisma.alertThreshold.findFirst({
      where: { metricName: data.metricName, NOT: { id } },
    });
    if (collision) {
      const err: any = new Error(`Threshold for metric "${data.metricName}" already exists`);
      err.status = 409;
      err.code = 'THRESHOLD_DUPLICATE';
      throw err;
    }
  }

  const updated = await prisma.alertThreshold.update({
    where: { id },
    data,
  });

  await writeAuditEntry(
    actorId,
    'UPDATE_THRESHOLD',
    'AlertThreshold',
    id,
    data,
  );

  logger.info({ msg: 'Alert threshold updated', id });
  return updated;
}

export async function deleteThreshold(id: string, actorId: string) {
  await getThresholdById(id); // throws 404 if not found

  await prisma.alertThreshold.delete({ where: { id } });

  await writeAuditEntry(actorId, 'DELETE_THRESHOLD', 'AlertThreshold', id, {});

  logger.info({ msg: 'Alert threshold deleted', id });
}
