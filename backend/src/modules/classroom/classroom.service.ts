import { ClassroomStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { emitToNamespace } from '../../lib/socket';
import { logger } from '../../lib/logger';
import { config } from '../../config';

// ---- Validators ----
export const heartbeatSchema = z.object({
  recognitionConfidence: z.number().min(0).max(1).optional(),
  metadata:              z.record(z.unknown()).optional(),
});

export type HeartbeatData = z.infer<typeof heartbeatSchema>;

// ---- Serializer ----
export function serializeClassroom(c: Record<string, unknown>) {
  return {
    id:                    c.id,
    hardwareNodeId:        c.hardwareNodeId,
    status:                c.status,
    recognitionConfidence: c.recognitionConfidence,
    confidenceThreshold:   c.confidenceThreshold,
    lastHeartbeatAt:       c.lastHeartbeatAt,
    isActive:              c.isActive,
    createdAt:             c.createdAt,
    updatedAt:             c.updatedAt,
    class: c.class as {
      id: string; name: string; roomNumber: string | null;
      course?: unknown; department?: unknown; semester?: unknown;
    } | undefined,
    openAnomalyCount: c.openAnomalyCount ?? 0,
  };
}

const classroomInclude = {
  class: {
    include: {
      course:     { select: { id: true, code: true, name: true } },
      department: { select: { id: true, name: true, code: true } },
      semester:   { select: { id: true, name: true } },
    },
  },
};

// ---- List classrooms ----
export async function listClassrooms(params: {
  departmentId?: string;
  status?: ClassroomStatus;
  search?: string;
  activeOnly?: boolean;
  page?: number;
  limit?: number;
}) {
  const { departmentId, status, search, activeOnly = true, page = 1, limit = 50 } = params;

  const where: Record<string, unknown> = {};
  if (activeOnly) where.isActive = true;
  if (status)     where.status = status;
  if (departmentId) {
    where.class = { department: { id: departmentId } };
  }
  if (search) {
    where.OR = [
      { hardwareNodeId: { contains: search } },
      { class: { name: { contains: search } } },
      { class: { roomNumber: { contains: search } } },
    ];
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.classroom.findMany({
      where: where as any,
      include: {
        ...classroomInclude,
        _count: { select: { anomalyEvents: { where: { status: { in: ['open', 'acknowledged', 'assigned'] } } } } },
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      skip,
      take: limit,
    }),
    prisma.classroom.count({ where: where as any }),
  ]);

  return {
    data: items.map(c => serializeClassroom({ ...c, openAnomalyCount: c._count.anomalyEvents })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// ---- Get classroom by id ----
export async function getClassroomById(id: string) {
  const classroom = await prisma.classroom.findUnique({
    where: { id },
    include: {
      ...classroomInclude,
      _count: { select: { anomalyEvents: { where: { status: { in: ['open', 'acknowledged', 'assigned'] } } } } },
      anomalyEvents: {
        where: { status: { in: ['open', 'acknowledged', 'assigned'] } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          assignedTo: { select: { id: true, username: true } },
        },
      },
    },
  });
  if (!classroom) return null;
  return serializeClassroom({ ...classroom, openAnomalyCount: classroom._count.anomalyEvents });
}

// ---- Aggregate stats ----
export async function getClassroomStats() {
  const [total, online, offline, degraded, activeAnomalies] = await Promise.all([
    prisma.classroom.count({ where: { isActive: true } }),
    prisma.classroom.count({ where: { isActive: true, status: 'online' } }),
    prisma.classroom.count({ where: { isActive: true, status: 'offline' } }),
    prisma.classroom.count({ where: { isActive: true, status: 'degraded' } }),
    prisma.anomalyEvent.count({ where: { status: { in: ['open', 'acknowledged', 'assigned'] } } }),
  ]);
  return { total, online, offline, degraded, activeAnomalies };
}

// ---- Process incoming heartbeat from hardware node ----
export async function processHeartbeat(hardwareNodeId: string, data: HeartbeatData) {
  const classroom = await prisma.classroom.findUnique({
    where: { hardwareNodeId },
  });

  if (!classroom || !classroom.isActive) {
    logger.warn({ msg: 'Heartbeat from unknown/inactive node', hardwareNodeId });
    return null;
  }

  const wasOffline = classroom.status === 'offline';
  const confidence = data.recognitionConfidence ?? classroom.recognitionConfidence;

  // Determine new status based on confidence threshold
  let newStatus: ClassroomStatus = 'online';
  if (confidence !== null && confidence !== undefined && confidence < classroom.confidenceThreshold) {
    newStatus = 'degraded';
  }

  const updated = await prisma.classroom.update({
    where: { id: classroom.id },
    data: {
      status:                newStatus,
      recognitionConfidence: confidence,
      lastHeartbeatAt:       new Date(),
    },
    include: classroomInclude,
  });

  // Emit real-time update
  emitToNamespace('/classroom', 'classroom:update', {
    id:                    updated.id,
    status:                updated.status,
    recognitionConfidence: updated.recognitionConfidence,
    lastHeartbeatAt:       updated.lastHeartbeatAt,
    wasOffline,
  });

  // If came back online from offline, emit recovery event
  if (wasOffline && newStatus === 'online') {
    emitToNamespace('/classroom', 'classroom:recovered', { id: updated.id, at: new Date().toISOString() });
    logger.info({ msg: 'Classroom came back online', classroomId: updated.id, hardwareNodeId });
  }

  return serializeClassroom({ ...updated, openAnomalyCount: 0 });
}

// ---- Mark stale classrooms as offline (called by heartbeat worker) ----
export async function markStaleClassroomsOffline(): Promise<{ offlineCount: number; anomaliesCreated: number }> {
  const staleThreshold = new Date(Date.now() - config.classroom.heartbeatStaleSeconds * 1000);

  // Find online/degraded classrooms that haven't heartbeated recently
  const stale = await prisma.classroom.findMany({
    where: {
      isActive: true,
      status: { in: ['online', 'degraded'] },
      OR: [
        { lastHeartbeatAt: { lt: staleThreshold } },
        { lastHeartbeatAt: null },
      ],
    },
    select: { id: true, hardwareNodeId: true, classId: true },
  });

  if (stale.length === 0) return { offlineCount: 0, anomaliesCreated: 0 };

  // Bulk mark offline
  await prisma.classroom.updateMany({
    where: { id: { in: stale.map(c => c.id) } },
    data: { status: 'offline' },
  });

  // Create anomaly for each newly offline classroom (if no open offline anomaly exists)
  let anomaliesCreated = 0;
  for (const classroom of stale) {
    const existing = await prisma.anomalyEvent.findFirst({
      where: {
        classroomId: classroom.id,
        type:        'node_offline',
        status:      { in: ['open', 'acknowledged', 'assigned'] },
      },
    });

    if (!existing) {
      await prisma.anomalyEvent.create({
        data: {
          classroomId: classroom.id,
          type:        'node_offline',
          description: `Hardware node ${classroom.hardwareNodeId} has not sent a heartbeat for over ${config.classroom.heartbeatStaleSeconds}s.`,
          status:      'open',
        },
      });
      anomaliesCreated++;

      emitToNamespace('/classroom', 'anomaly:created', {
        classroomId:   classroom.id,
        type:          'node_offline',
        hardwareNodeId: classroom.hardwareNodeId,
        at:            new Date().toISOString(),
      });
    }

    emitToNamespace('/classroom', 'classroom:update', {
      id:     classroom.id,
      status: 'offline',
    });
  }

  logger.info({ msg: 'Stale classrooms marked offline', count: stale.length, anomaliesCreated });
  return { offlineCount: stale.length, anomaliesCreated };
}
