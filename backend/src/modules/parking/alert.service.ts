import { z } from 'zod';
import { ParkingAlertStatus, ParkingAlertType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { emitToNamespace } from '../../lib/socket';
import { logger } from '../../lib/logger';
import { config } from '../../config';
import { writeAuditEntry } from '../admin/audit.service';

// ---- Validators ----
export const createAlertSchema = z.object({
  lotId:       z.string().uuid(),
  type:        z.nativeEnum(ParkingAlertType),
  description: z.string().min(1).max(2000).trim(),
});

export const closeAlertSchema = z.object({
  closureNote: z.string().min(5, 'Closure note must be at least 5 characters').max(2000).trim(),
});

export const escalateAlertSchema = z.object({
  note: z.string().max(500).optional(),
});

// ---- Includes ----
const alertInclude = {
  lot:      { select: { id: true, name: true, totalSpaces: true } },
  claimedBy: { select: { id: true, username: true } },
  closedBy:  { select: { id: true, username: true } },
  timeline:  { orderBy: { createdAt: 'asc' as const } },
};

function serializeAlert(a: Record<string, unknown>) {
  const createdAt = a.createdAt as Date;
  const slaDeadlineAt = a.slaDeadlineAt as Date | null;
  const closedAt = a.closedAt as Date | null;
  const now = new Date();

  let slaStatus: 'within_sla' | 'at_risk' | 'breached' | 'closed' = 'within_sla';
  if (closedAt) {
    slaStatus = 'closed';
  } else if (slaDeadlineAt) {
    const msRemaining = slaDeadlineAt.getTime() - now.getTime();
    if (msRemaining < 0)           slaStatus = 'breached';
    else if (msRemaining < 180_000) slaStatus = 'at_risk'; // < 3 min
  }

  return {
    ...a,
    ageSeconds:    Math.floor((now.getTime() - createdAt.getTime()) / 1000),
    slaStatus,
    msToSlaDeadline: slaDeadlineAt ? slaDeadlineAt.getTime() - now.getTime() : null,
  };
}

// ---- List alerts ----
export async function listAlerts(params: {
  lotId?: string;
  status?: ParkingAlertStatus | ParkingAlertStatus[];
  type?: ParkingAlertType;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { lotId, status, type, from, to, search, page = 1, limit = 50 } = params;
  const where: Record<string, unknown> = {};
  if (lotId) where.lotId = lotId;
  if (type)  where.type = type;
  if (status) {
    where.status = Array.isArray(status) ? { in: status } : status;
  }
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: new Date(to)   } : {}),
    };
  }
  if (search) {
    where.description = { contains: search };
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.parkingAlert.findMany({
      where: where as any,
      include: alertInclude,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
    }),
    prisma.parkingAlert.count({
      where: where as any,
    }),
  ]);

  return {
    data: items.map(a => serializeAlert(a as unknown as Record<string, unknown>)),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// ---- Get alert by id ----
export async function getAlertById(id: string) {
  const alert = await prisma.parkingAlert.findUnique({
    where: { id },
    include: alertInclude,
  });
  if (!alert) return null;
  return serializeAlert(alert as unknown as Record<string, unknown>);
}

// ---- Create alert (with dedup) ----
export async function createAlert(data: z.infer<typeof createAlertSchema>, actorId: string) {
  const lot = await prisma.parkingLot.findUnique({ where: { id: data.lotId } });
  if (!lot) throw Object.assign(new Error('Lot not found'), { status: 404, code: 'NOT_FOUND' });

  // Dedup: overtime and no_plate_captured — one open alert per lot per type
  if (['overtime', 'no_plate_captured'].includes(data.type)) {
    const existing = await prisma.parkingAlert.findFirst({
      where: { lotId: data.lotId, type: data.type, status: { in: ['open', 'claimed'] } },
    });
    if (existing) {
      throw Object.assign(
        new Error(`An open ${data.type} alert already exists for this lot`),
        { status: 409, code: 'DUPLICATE_ALERT' }
      );
    }
  }

  const slaDeadline = new Date(Date.now() + config.parking.alertSlaMinutes * 60 * 1000);

  const alert = await prisma.parkingAlert.create({
    data: { ...data, status: 'open', slaDeadlineAt: slaDeadline },
    include: alertInclude,
  });

  await prisma.parkingAlertTimelineEntry.create({
    data: { alertId: alert.id, actorId, action: 'created', note: data.description },
  });

  emitToNamespace('/parking', 'alert:created', {
    alertId:     alert.id,
    lotId:       data.lotId,
    type:        data.type,
    status:      'open',
    slaDeadlineAt: slaDeadline.toISOString(),
  });

  await writeAuditEntry(actorId, 'parking_alert.create', 'parking_alert', alert.id, { type: data.type });
  return serializeAlert(alert as unknown as Record<string, unknown>);
}

// ---- Claim: open → claimed ----
export async function claimAlert(id: string, actorId: string) {
  const alert = await prisma.parkingAlert.findUnique({ where: { id } });
  if (!alert) throw Object.assign(new Error('Alert not found'), { status: 404, code: 'NOT_FOUND' });
  if (alert.status !== 'open') {
    throw Object.assign(new Error(`Cannot claim alert in status '${alert.status}'`), { status: 409, code: 'INVALID_TRANSITION' });
  }

  const updated = await prisma.parkingAlert.update({
    where: { id },
    data: { status: 'claimed', claimedById: actorId, claimedAt: new Date() },
    include: alertInclude,
  });

  await prisma.parkingAlertTimelineEntry.create({
    data: { alertId: id, actorId, action: 'claimed' },
  });

  emitToNamespace('/parking', 'alert:updated', { alertId: id, status: 'claimed', actorId });
  await writeAuditEntry(actorId, 'parking_alert.claim', 'parking_alert', id, {});
  return serializeAlert(updated as unknown as Record<string, unknown>);
}

// ---- Close: claimed → closed (requires closure note) ----
export async function closeAlert(id: string, data: z.infer<typeof closeAlertSchema>, actorId: string) {
  const alert = await prisma.parkingAlert.findUnique({ where: { id } });
  if (!alert) throw Object.assign(new Error('Alert not found'), { status: 404, code: 'NOT_FOUND' });
  if (alert.status !== 'claimed') {
    throw Object.assign(new Error(`Cannot close alert in status '${alert.status}'`), { status: 409, code: 'INVALID_TRANSITION' });
  }

  const now = new Date();
  const updated = await prisma.parkingAlert.update({
    where: { id },
    data: {
      status:      'closed',
      closedById:  actorId,
      closedAt:    now,
      closureNote: data.closureNote,
    },
    include: alertInclude,
  });

  await prisma.parkingAlertTimelineEntry.create({
    data: { alertId: id, actorId, action: 'closed', note: data.closureNote },
  });

  emitToNamespace('/parking', 'alert:updated', { alertId: id, status: 'closed', actorId });
  await writeAuditEntry(actorId, 'parking_alert.close', 'parking_alert', id, { closureNote: data.closureNote });
  return serializeAlert(updated as unknown as Record<string, unknown>);
}

// ---- Escalate: any active → escalated ----
export async function escalateAlert(id: string, data: z.infer<typeof escalateAlertSchema>, actorId: string | null) {
  const alert = await prisma.parkingAlert.findUnique({ where: { id } });
  if (!alert) throw Object.assign(new Error('Alert not found'), { status: 404, code: 'NOT_FOUND' });
  if (!['open', 'claimed'].includes(alert.status)) {
    throw Object.assign(new Error(`Cannot escalate alert in status '${alert.status}'`), { status: 409, code: 'INVALID_TRANSITION' });
  }

  const updated = await prisma.parkingAlert.update({
    where: { id },
    data: { status: 'escalated', escalatedAt: new Date() },
    include: alertInclude,
  });

  await prisma.parkingAlertTimelineEntry.create({
    data: {
      alertId: id,
      actorId,
      action:  actorId ? 'escalated' : 'auto_escalated',
      note:    data.note ?? (actorId ? null : `SLA breached — auto-escalated after ${config.parking.alertSlaMinutes} minutes`),
    },
  });

  emitToNamespace('/parking', 'alert:updated', { alertId: id, status: 'escalated', actorId });
  emitToNamespace('/supervisor-queue', 'parking:alert:escalated', {
    alertId: id,
    lotId:   alert.lotId,
    type:    alert.type,
    auto:    !actorId,
    at:      new Date().toISOString(),
  });

  if (actorId) {
    await writeAuditEntry(actorId, 'parking_alert.escalate', 'parking_alert', id, { note: data.note });
  }
  return serializeAlert(updated as unknown as Record<string, unknown>);
}

// ---- Auto-escalate SLA breaches (called by worker every 30s) ----
export async function escalateSlaBreaches(): Promise<number> {
  const now = new Date();
  const breached = await prisma.parkingAlert.findMany({
    where: {
      status:       { in: ['open', 'claimed'] },
      slaDeadlineAt: { lte: now, not: null },
    },
    select: { id: true, lotId: true, type: true },
  });

  for (const alert of breached) {
    try {
      await escalateAlert(alert.id, {}, null);
    } catch (err) {
      logger.error({ msg: 'Failed to auto-escalate alert', alertId: alert.id, err });
    }
  }

  if (breached.length > 0) {
    logger.warn({ msg: 'Auto-escalated SLA-breached parking alerts', count: breached.length });
  }
  return breached.length;
}

// ---- Metrics ----
export async function getAlertMetrics(lotId?: string) {
  const where: Record<string, unknown> = {};
  if (lotId) where.lotId = lotId;

  const oneHourAgo = new Date(Date.now() - 3_600_000);
  const [
    totalOpen,
    totalEscalated,
    createdLastHour,
    closedWithTime,
  ] = await Promise.all([
    prisma.parkingAlert.count({ where: { ...where, status: { in: ['open', 'claimed'] } } }),
    prisma.parkingAlert.count({ where: { ...where, status: 'escalated' } }),
    prisma.parkingAlert.count({ where: { ...where as Record<string, unknown>, createdAt: { gte: oneHourAgo } } }),
    prisma.parkingAlert.findMany({
      where: { ...where, status: 'closed', closedAt: { not: null } },
      select: { createdAt: true, closedAt: true },
    }),
  ]);

  let mttcMinutes = 0;
  if (closedWithTime.length > 0) {
    const totalMs = closedWithTime.reduce((sum, a) => {
      return sum + (a.closedAt!.getTime() - a.createdAt.getTime());
    }, 0);
    mttcMinutes = Math.round(totalMs / closedWithTime.length / 60_000);
  }

  return {
    openAlerts:          totalOpen,
    escalatedAlerts:     totalEscalated,
    creationRatePerHour: createdLastHour,
    meanTimeToCloseMin:  mttcMinutes,
    totalClosed:         closedWithTime.length,
  };
}
