import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { emitToNamespace } from '../../lib/socket';
import { logger } from '../../lib/logger';

// ---- Validators ----
export const recordEntrySchema = z.object({
  lotId:       z.string().uuid(),
  plateNumber: z.string().max(20).trim().optional(),
});

export const recordExitSchema = z.object({
  sessionId: z.string().uuid(),
});

// ---- Lot listing ----
export async function listLots(params: { activeOnly?: boolean; search?: string }) {
  const { activeOnly = true, search } = params;
  const where: Record<string, unknown> = {};
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
export async function getLotStats(id: string) {
  const lot = await prisma.parkingLot.findUnique({ where: { id } });
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
export async function getDashboardStats() {
  const lots = await listLots({ activeOnly: true });
  const totalSpaces     = lots.reduce((s, l) => s + l.totalSpaces, 0);
  const occupiedSpaces  = lots.reduce((s, l) => s + l.occupiedSpaces, 0);
  const activeAlerts    = lots.reduce((s, l) => s + l.activeAlerts, 0);

  const escalatedCount = await prisma.parkingAlert.count({
    where: { status: 'escalated' },
  });

  return {
    totalLots:       lots.length,
    totalSpaces,
    occupiedSpaces,
    availableSpaces: Math.max(0, totalSpaces - occupiedSpaces),
    occupancyPct:    totalSpaces > 0 ? Math.round((occupiedSpaces / totalSpaces) * 100) : 0,
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
      lotId:       data.lotId,
      plateNumber: data.plateNumber ?? null,
      entryAt:     new Date(),
    },
  });

  // Auto-create alert if no plate captured
  if (!data.plateNumber) {
    await createNoPlateCapturedAlert(data.lotId, session.id);
  }

  emitToNamespace('/parking', 'session:entry', {
    lotId:     data.lotId,
    sessionId: session.id,
    plate:     data.plateNumber ?? null,
    at:        session.entryAt.toISOString(),
  });

  // Emit updated stats
  const stats = await getLotStats(data.lotId);
  emitToNamespace('/parking', 'lot:stats-update', { lotId: data.lotId, stats });

  return session;
}

export async function recordExit(sessionId: string) {
  const session = await prisma.parkingSession.findUnique({ where: { id: sessionId } });
  if (!session) throw Object.assign(new Error('Session not found'), { status: 404, code: 'NOT_FOUND' });
  if (session.exitAt) throw Object.assign(new Error('Session already exited'), { status: 409, code: 'ALREADY_EXITED' });

  const updated = await prisma.parkingSession.update({
    where: { id: sessionId },
    data:  { exitAt: new Date() },
  });

  emitToNamespace('/parking', 'session:exit', {
    lotId:     session.lotId,
    sessionId: session.id,
    plate:     session.plateNumber,
    durationMin: Math.round((updated.exitAt!.getTime() - session.entryAt.getTime()) / 60_000),
    at: updated.exitAt!.toISOString(),
  });

  const stats = await getLotStats(session.lotId);
  emitToNamespace('/parking', 'lot:stats-update', { lotId: session.lotId, stats });

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
}) {
  const { lotId, active, plateNumber, from, to, page = 1, limit = 50 } = params;
  const where: Record<string, unknown> = {};
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
async function createNoPlateCapturedAlert(lotId: string, sessionId: string) {
  // Check dedup — open alert of same type for this lot
  const existing = await prisma.parkingAlert.findFirst({
    where: { lotId, type: 'no_plate_captured', status: { in: ['open', 'claimed'] } },
  });
  if (existing) return;

  const slaDeadline = new Date(Date.now() + 15 * 60 * 1000);
  const alert = await prisma.parkingAlert.create({
    data: {
      lotId,
      type:         'no_plate_captured',
      status:       'open',
      description:  `Vehicle entered without plate capture (session ${sessionId})`,
      slaDeadlineAt: slaDeadline,
    },
  });

  emitToNamespace('/parking', 'alert:created', {
    alertId: alert.id,
    lotId,
    type:    alert.type,
    slaDeadlineAt: slaDeadline.toISOString(),
  });

  logger.info({ msg: 'Auto-created no_plate_captured alert', alertId: alert.id, lotId });
}
