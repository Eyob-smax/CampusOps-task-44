import { z } from 'zod';
import type { ParkingAlertType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { emitToCampusNamespace } from '../../lib/socket';
import { logger } from '../../lib/logger';
import { config } from '../../config';
import type { AuthenticatedUser } from '../../types';

// ---- Validators ----
export const recordEntrySchema = z.object({
  lotId:       z.string().uuid(),
  plateNumber: z.string().max(20).trim().optional(),
});

export const recordExitSchema = z.object({
  sessionId: z.string().uuid(),
});

// ---- Lot listing ----
export async function listLots(params: { activeOnly?: boolean; search?: string }, requester?: AuthenticatedUser) {
  const { activeOnly = true, search } = params;
  const where: Record<string, unknown> = {};
  if (requester?.campusId) where.campusId = requester.campusId;
  if (activeOnly) where.isActive = true;
  if (search)     where.name = { contains: search };

  const lots = await prisma.parkingLot.findMany({
    where: where as any,
    include: {
      _count: {
        select: {
          sessions: { where: { exitAt: null } },
          alerts:   { where: { status: { in: ['open', 'claimed'] } } },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  return lots.map(lot => ({
    id:             lot.id,
    name:           lot.name,
    totalSpaces:    lot.totalSpaces,
    occupiedSpaces: lot._count.sessions,
    availableSpaces: Math.max(0, lot.totalSpaces - lot._count.sessions),
    occupancyPct:   lot.totalSpaces > 0
      ? Math.round((lot._count.sessions / lot.totalSpaces) * 100)
      : 0,
    activeAlerts:   lot._count.alerts,
    isActive:       lot.isActive,
    createdAt:      lot.createdAt,
    updatedAt:      lot.updatedAt,
  }));
}

// ---- Lot stats (turnover, occupancy, dwell) ----
export async function getLotStats(id: string, requester?: AuthenticatedUser) {
  const lot = await prisma.parkingLot.findFirst({
    where: {
      id,
      ...(requester?.campusId ? { campusId: requester.campusId } : {}),
    },
  });
  if (!lot) return null;

  const oneHourAgo = new Date(Date.now() - 3_600_000);
  const oneDayAgo  = new Date(Date.now() - 86_400_000);

  const [activeSessions, entriesLastHour, closedToday] = await Promise.all([
    prisma.parkingSession.count({ where: { lotId: id, exitAt: null } }),
    prisma.parkingSession.count({ where: { lotId: id, entryAt: { gte: oneHourAgo } } }),
    prisma.parkingSession.findMany({
      where: { lotId: id, exitAt: { gte: oneDayAgo, not: null } },
      select: { entryAt: true, exitAt: true },
    }),
  ]);

  // Average dwell time (minutes)
  let avgDwellMin = 0;
  if (closedToday.length > 0) {
    const totalMs = closedToday.reduce((sum, s) => {
      return sum + (s.exitAt!.getTime() - s.entryAt.getTime());
    }, 0);
    avgDwellMin = Math.round(totalMs / closedToday.length / 60_000);
  }

  return {
    lotId:           id,
    name:            lot.name,
    totalSpaces:     lot.totalSpaces,
    occupiedSpaces:  activeSessions,
    availableSpaces: Math.max(0, lot.totalSpaces - activeSessions),
    occupancyPct:    lot.totalSpaces > 0 ? Math.round((activeSessions / lot.totalSpaces) * 100) : 0,
    entriesLastHour,
    turnoverRate:    entriesLastHour, // entries/hour
    avgDwellMinutes: avgDwellMin,
  };
}

// ---- Dashboard aggregate (all lots) ----
export async function getDashboardStats(requester?: AuthenticatedUser) {
  const lots = await listLots({ activeOnly: true }, requester);
  const totalSpaces     = lots.reduce((s, l) => s + l.totalSpaces, 0);
  const occupiedSpaces  = lots.reduce((s, l) => s + l.occupiedSpaces, 0);
  const activeAlerts    = lots.reduce((s, l) => s + l.activeAlerts, 0);
  const oneHourAgo = new Date(Date.now() - 3_600_000);
  const lotIds = lots.map((lot) => lot.id);

  const turnoverPerHour = lotIds.length
    ? await prisma.parkingSession.count({
        where: {
          lotId: { in: lotIds },
          entryAt: { gte: oneHourAgo },
        },
      })
    : 0;

  const escalatedCount = await prisma.parkingAlert.count({
    where: {
      ...(requester?.campusId ? { campusId: requester.campusId } : {}),
      status: 'escalated',
    },
  });

  return {
    totalLots:       lots.length,
    totalSpaces,
    occupiedSpaces,
    availableSpaces: Math.max(0, totalSpaces - occupiedSpaces),
    occupancyPct:    totalSpaces > 0 ? Math.round((occupiedSpaces / totalSpaces) * 100) : 0,
    turnoverPerHour,
    activeAlerts,
    escalatedAlerts: escalatedCount,
    lots,
  };
}

// ---- Sessions ----
export async function recordEntry(data: z.infer<typeof recordEntrySchema>) {
  const lot = await prisma.parkingLot.findUnique({ where: { id: data.lotId } });
  if (!lot || !lot.isActive) {
    throw Object.assign(new Error('Parking lot not found or inactive'), { status: 404, code: 'NOT_FOUND' });
  }

  const session = await prisma.parkingSession.create({
    data: {
      campusId:    lot.campusId,
      lotId:       data.lotId,
      plateNumber: data.plateNumber ?? null,
      entryAt:     new Date(),
    },
  });

  // Auto-create alert if no plate captured
  if (!data.plateNumber) {
    await createNoPlateCapturedAlert(data.lotId, session.id, lot.campusId);
  } else {
    await detectDuplicatePlateForSession(data.lotId, data.plateNumber, session.id, lot.campusId);
  }

  emitToCampusNamespace('/parking', lot.campusId, 'session:entry', {
    lotId:     data.lotId,
    campusId:  lot.campusId,
    sessionId: session.id,
    plate:     data.plateNumber ?? null,
    at:        session.entryAt.toISOString(),
  });

  // Emit updated stats
  const stats = await getLotStats(data.lotId);
  emitToCampusNamespace('/parking', lot.campusId, 'lot:stats-update', {
    lotId: data.lotId,
    campusId: lot.campusId,
    stats,
  });

  return session;
}

export async function recordExit(sessionId: string) {
  const session = await prisma.parkingSession.findUnique({ where: { id: sessionId } });
  if (!session) throw Object.assign(new Error('Session not found'), { status: 404, code: 'NOT_FOUND' });
  if (session.exitAt) {
    await createAutomatedAlert({
      campusId: session.campusId,
      lotId: session.lotId,
      type: 'inconsistent_entry_exit',
      dedupKey: `double-exit:${session.id}`,
      description: `Duplicate exit event received for already closed session ${session.id}`,
    });
    throw Object.assign(new Error('Session already exited'), { status: 409, code: 'ALREADY_EXITED' });
  }

  const updated = await prisma.parkingSession.update({
    where: { id: sessionId },
    data:  { exitAt: new Date() },
  });

  if (!updated.isSettled) {
    await createAutomatedAlert({
      campusId: updated.campusId,
      lotId: updated.lotId,
      type: 'unsettled_session',
      dedupKey: `unsettled:${updated.id}`,
      description: `Session ${updated.id} exited without settlement`,
    });
  }

  emitToCampusNamespace('/parking', session.campusId, 'session:exit', {
    lotId:     session.lotId,
    campusId:  session.campusId,
    sessionId: session.id,
    plate:     session.plateNumber,
    durationMin: Math.round((updated.exitAt!.getTime() - session.entryAt.getTime()) / 60_000),
    at: updated.exitAt!.toISOString(),
  });

  const stats = await getLotStats(session.lotId);
  emitToCampusNamespace('/parking', session.campusId, 'lot:stats-update', {
    lotId: session.lotId,
    campusId: session.campusId,
    stats,
  });

  return updated;
}

export async function listSessions(params: {
  lotId?: string;
  active?: boolean;
  plateNumber?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}, requester?: AuthenticatedUser) {
  const { lotId, active, plateNumber, from, to, page = 1, limit = 50 } = params;
  const where: Record<string, unknown> = {};
  if (requester?.campusId) where.campusId = requester.campusId;
  if (lotId)       where.lotId = lotId;
  if (plateNumber) where.plateNumber = { contains: plateNumber };
  if (active === true)  where.exitAt = null;
  if (active === false) where.exitAt = { not: null };
  if (from || to) {
    where.entryAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: new Date(to)   } : {}),
    };
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.parkingSession.findMany({
      where: where as any,
      include: { lot: { select: { name: true } } },
      orderBy: { entryAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.parkingSession.count({
      where: where as any,
    }),
  ]);

  return { data: items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ---- Internal helper ----
async function createNoPlateCapturedAlert(lotId: string, sessionId: string, campusId: string) {
  // Check dedup — open alert of same type for this lot
  const existing = await prisma.parkingAlert.findFirst({
    where: { campusId, lotId, type: 'no_plate_captured', status: { in: ['open', 'claimed'] } },
  });
  if (existing) return;

  const slaDeadline = new Date(Date.now() + config.parking.alertSlaMinutes * 60 * 1000);
  const alert = await prisma.parkingAlert.create({
    data: {
      campusId,
      lotId,
      type:         'no_plate_captured',
      status:       'open',
      description:  `Vehicle entered without plate capture (session ${sessionId})`,
      slaDeadlineAt: slaDeadline,
    },
  });

  emitToCampusNamespace('/parking', campusId, 'alert:created', {
    alertId: alert.id,
    lotId,
    campusId,
    type:    alert.type,
    slaDeadlineAt: slaDeadline.toISOString(),
  });

  logger.info({ msg: 'Auto-created no_plate_captured alert', alertId: alert.id, lotId });
}

async function createAutomatedAlert(params: {
  campusId: string;
  lotId: string;
  type: ParkingAlertType;
  dedupKey: string;
  description: string;
}): Promise<boolean> {
  const dedupTag = `[auto-key:${params.dedupKey}]`;
  const existing = await prisma.parkingAlert.findFirst({
    where: {
      campusId: params.campusId,
      lotId: params.lotId,
      type: params.type,
      status: { in: ['open', 'claimed'] },
      description: { contains: dedupTag },
    },
  });
  if (existing) return false;

  const slaDeadline = new Date(Date.now() + config.parking.alertSlaMinutes * 60 * 1000);
  const alert = await prisma.parkingAlert.create({
    data: {
      campusId: params.campusId,
      lotId: params.lotId,
      type: params.type,
      status: 'open',
      description: `${params.description} ${dedupTag}`,
      slaDeadlineAt: slaDeadline,
    },
  });

  await prisma.parkingAlertTimelineEntry.create({
    data: {
      alertId: alert.id,
      actorId: 'system',
      action: 'auto_created',
      note: params.description,
    },
  });

  emitToCampusNamespace('/parking', params.campusId, 'alert:created', {
    alertId: alert.id,
    lotId: params.lotId,
    campusId: params.campusId,
    type: params.type,
    slaDeadlineAt: slaDeadline.toISOString(),
  });

  logger.info({ msg: 'Auto-created parking alert', alertId: alert.id, lotId: params.lotId, type: params.type });
  return true;
}

async function detectDuplicatePlateForSession(lotId: string, plateNumber: string, sessionId: string, campusId: string): Promise<void> {
  const activeDuplicates = await prisma.parkingSession.count({
    where: {
      campusId,
      lotId,
      plateNumber,
      exitAt: null,
    },
  });

  if (activeDuplicates <= 1) return;

  await createAutomatedAlert({
    campusId,
    lotId,
    type: 'duplicate_plate',
    dedupKey: `duplicate:${lotId}:${plateNumber.toUpperCase()}`,
    description: `Duplicate active plate ${plateNumber} detected (session ${sessionId})`,
  });
}

async function detectOvertimeSessions(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - config.parking.sessionOvertimeMinutes * 60 * 1000);
  const overtimeSessions = await prisma.parkingSession.findMany({
    where: {
      exitAt: null,
      entryAt: { lte: cutoff },
    },
    select: {
      id: true,
      campusId: true,
      lotId: true,
      plateNumber: true,
      entryAt: true,
    },
  });

  let created = 0;
  for (const session of overtimeSessions) {
    const wasCreated = await createAutomatedAlert({
      campusId: session.campusId,
      lotId: session.lotId,
      type: 'overtime',
      dedupKey: `overtime:${session.id}`,
      description: `Overtime parking session ${session.id} exceeded ${config.parking.sessionOvertimeMinutes} minutes`,
    });
    if (wasCreated) created++;
  }
  return created;
}

async function detectUnsettledSessions(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - config.parking.unsettledGraceMinutes * 60 * 1000);
  const unsettledSessions = await prisma.parkingSession.findMany({
    where: {
      isSettled: false,
      exitAt: {
        not: null,
        lte: cutoff,
      },
    },
    select: {
      id: true,
      campusId: true,
      lotId: true,
    },
  });

  let created = 0;
  for (const session of unsettledSessions) {
    const wasCreated = await createAutomatedAlert({
      campusId: session.campusId,
      lotId: session.lotId,
      type: 'unsettled_session',
      dedupKey: `unsettled:${session.id}`,
      description: `Session ${session.id} remains unsettled after exit grace period`,
    });
    if (wasCreated) created++;
  }
  return created;
}

async function detectDuplicatePlateSessions(): Promise<number> {
  const activeSessions = await prisma.parkingSession.findMany({
    where: {
      exitAt: null,
      plateNumber: { not: null },
    },
    select: {
      id: true,
      campusId: true,
      lotId: true,
      plateNumber: true,
    },
  });

  const grouped = new Map<string, Array<{ id: string; campusId: string; lotId: string; plateNumber: string }>>();
  for (const session of activeSessions) {
    const plate = (session.plateNumber ?? '').trim();
    if (!plate) continue;
    const key = `${session.campusId}:${session.lotId}:${plate.toUpperCase()}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push({ id: session.id, campusId: session.campusId, lotId: session.lotId, plateNumber: plate });
    grouped.set(key, bucket);
  }

  let created = 0;
  for (const [key, group] of grouped.entries()) {
    if (group.length <= 1) continue;
    const campusId = group[0]!.campusId;
    const lotId = group[0]!.lotId;
    const plateNumber = group[0]!.plateNumber;
    const wasCreated = await createAutomatedAlert({
      campusId,
      lotId,
      type: 'duplicate_plate',
      dedupKey: `duplicate:${key}`,
      description: `Duplicate active plate ${plateNumber} detected across ${group.length} sessions`,
    });
    if (wasCreated) created++;
  }
  return created;
}

async function detectInconsistentEntryExitSessions(): Promise<number> {
  const inconsistentSessions = await prisma.parkingSession.findMany({
    where: {
      isSettled: true,
      exitAt: null,
    },
    select: {
      id: true,
      campusId: true,
      lotId: true,
    },
  });

  let created = 0;
  for (const session of inconsistentSessions) {
    const wasCreated = await createAutomatedAlert({
      campusId: session.campusId,
      lotId: session.lotId,
      type: 'inconsistent_entry_exit',
      dedupKey: `inconsistent:settled-without-exit:${session.id}`,
      description: `Session ${session.id} is marked settled but has no exit timestamp`,
    });
    if (wasCreated) created++;
  }
  return created;
}

export async function runParkingExceptionDetectors(): Promise<{
  overtime: number;
  unsettledSession: number;
  duplicatePlate: number;
  inconsistentEntryExit: number;
}> {
  const now = new Date();

  const [overtime, unsettledSession, duplicatePlate, inconsistentEntryExit] = await Promise.all([
    detectOvertimeSessions(now),
    detectUnsettledSessions(now),
    detectDuplicatePlateSessions(),
    detectInconsistentEntryExitSessions(),
  ]);

  return {
    overtime,
    unsettledSession,
    duplicatePlate,
    inconsistentEntryExit,
  };
}
