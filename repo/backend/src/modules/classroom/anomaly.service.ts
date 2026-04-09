import { AnomalyEventStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { emitToCampusNamespace } from "../../lib/socket";
import { logger } from "../../lib/logger";
import { config } from "../../config";
import { writeAuditEntry } from "../admin/audit.service";
import type { AuthenticatedUser } from "../../types";

// ---- Validators ----
export const createAnomalySchema = z.object({
  classroomId: z.string().uuid(),
  type: z.string().min(1).max(80).trim(),
  description: z.string().min(1).max(2000).trim(),
});

export const assignAnomalySchema = z.object({
  assignedToId: z.string().uuid(),
  note: z.string().max(500).optional(),
});

export const resolveAnomalySchema = z.object({
  resolutionNote: z
    .string()
    .trim()
    .min(20, "Resolution note must be at least 20 characters")
    .max(2000),
});

export const escalateAnomalySchema = z.object({
  note: z.string().max(500).optional(),
});

// ---- Serializer ----
function serializeAnomaly(a: Record<string, unknown>) {
  return {
    id: a.id,
    classroomId: a.classroomId,
    type: a.type,
    description: a.description,
    status: a.status,
    acknowledgedById: a.acknowledgedById,
    acknowledgedBy: a.acknowledgedBy,
    acknowledgedAt: a.acknowledgedAt,
    assignedToId: a.assignedToId,
    assignedTo: a.assignedTo,
    resolvedById: a.resolvedById,
    resolvedBy: a.resolvedBy,
    resolutionNote: a.resolutionNote,
    escalatedAt: a.escalatedAt,
    resolvedAt: a.resolvedAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    classroom: a.classroom,
    timeline: a.timeline,
  };
}

const anomalyInclude = {
  classroom: {
    select: {
      id: true,
      hardwareNodeId: true,
      class: {
        select: {
          name: true,
          roomNumber: true,
          department: { select: { name: true, code: true } },
        },
      },
    },
  },
  acknowledgedBy: { select: { id: true, username: true } },
  assignedTo: { select: { id: true, username: true } },
  resolvedBy: { select: { id: true, username: true } },
  timeline: {
    orderBy: { createdAt: "asc" as const },
  },
};

export function canAcknowledgeAnomalyStatus(status: string): boolean {
  return status === 'open';
}

export function canAssignAnomalyStatus(status: string): boolean {
  return status === 'acknowledged';
}

export function canResolveAnomalyStatus(status: string): boolean {
  return status === 'assigned';
}

export function canEscalateAnomalyStatus(status: string): boolean {
  return ['open', 'acknowledged', 'assigned'].includes(status);
}

// ---- List anomalies ----
export async function listAnomalies(params: {
  classroomId?: string;
  status?: AnomalyEventStatus | AnomalyEventStatus[];
  type?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}, requester?: AuthenticatedUser) {
  const {
    classroomId,
    status,
    type,
    search,
    from,
    to,
    page = 1,
    limit = 50,
  } = params;

  const where: Record<string, unknown> = {};
  if (requester?.campusId) where.campusId = requester.campusId;
  if (classroomId) where.classroomId = classroomId;
  if (type) where.type = type;
  if (status) {
    where.status = Array.isArray(status) ? { in: status } : status;
  }
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }
  if (search) {
    where.OR = [
      { description: { contains: search } },
      { type: { contains: search } },
    ];
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.anomalyEvent.findMany({
      where: where as any,
      include: anomalyInclude,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip,
      take: limit,
    }),
    prisma.anomalyEvent.count({
      where: where as any,
    }),
  ]);

  return {
    data: items.map((a) =>
      serializeAnomaly(a as unknown as Record<string, unknown>),
    ),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// ---- Get anomaly by id ----
export async function getAnomalyById(id: string, requester?: AuthenticatedUser) {
  const anomaly = await prisma.anomalyEvent.findFirst({
    where: {
      id,
      ...(requester?.campusId ? { campusId: requester.campusId } : {}),
    },
    include: anomalyInclude,
  });
  if (!anomaly) return null;
  return serializeAnomaly(anomaly as unknown as Record<string, unknown>);
}

// ---- Create anomaly (admin / system) ----
export async function createAnomaly(
  data: z.infer<typeof createAnomalySchema>,
  actorId: string,
  requester?: AuthenticatedUser,
) {
  const payload = createAnomalySchema.parse(data);
  const classroom = await prisma.classroom.findFirst({
    where: {
      id: payload.classroomId,
      ...(requester?.campusId ? { campusId: requester.campusId } : {}),
    },
  });
  if (!classroom)
    throw Object.assign(new Error("Classroom not found"), {
      status: 404,
      code: "NOT_FOUND",
    });

  const createData: Prisma.AnomalyEventUncheckedCreateInput = {
    campusId: classroom.campusId,
    classroomId: payload.classroomId,
    type: payload.type,
    description: payload.description,
    status: "open",
  };

  const anomaly = await prisma.anomalyEvent.create({
    data: createData,
    include: anomalyInclude,
  });

  await prisma.anomalyTimelineEntry.create({
    data: {
      anomalyId: anomaly.id,
      actorId,
      action: "created",
      note: `Anomaly manually created: ${payload.type}`,
    },
  });

  emitToCampusNamespace("/classroom", classroom.campusId, "anomaly:created", {
    anomalyId: anomaly.id,
    classroomId: anomaly.classroomId,
    campusId: classroom.campusId,
    type: anomaly.type,
    status: anomaly.status,
  });

  await writeAuditEntry(
    actorId,
    "anomaly.create",
    "anomaly_event",
    anomaly.id,
    { type: payload.type },
  );
  return serializeAnomaly(anomaly as unknown as Record<string, unknown>);
}

// ---- Acknowledge: open → acknowledged ----
export async function acknowledgeAnomaly(id: string, actorId: string, requester?: AuthenticatedUser) {
  const anomaly = await prisma.anomalyEvent.findFirst({
    where: {
      id,
      ...(requester?.campusId ? { campusId: requester.campusId } : {}),
    },
  });
  if (!anomaly)
    throw Object.assign(new Error("Anomaly not found"), {
      status: 404,
      code: "NOT_FOUND",
    });
  if (!canAcknowledgeAnomalyStatus(anomaly.status)) {
    throw Object.assign(
      new Error(`Cannot acknowledge anomaly in status '${anomaly.status}'`),
      { status: 409, code: "INVALID_TRANSITION" },
    );
  }

  const updated = await prisma.anomalyEvent.update({
    where: { id },
    data: {
      status: "acknowledged",
      acknowledgedById: actorId,
      acknowledgedAt: new Date(),
    },
    include: anomalyInclude,
  });

  await prisma.anomalyTimelineEntry.create({
    data: { anomalyId: id, actorId, action: "acknowledged" },
  });

  emitToCampusNamespace("/classroom", anomaly.campusId, "anomaly:updated", {
    anomalyId: id,
    campusId: anomaly.campusId,
    status: "acknowledged",
    actorId,
  });

  await writeAuditEntry(
    actorId,
    "anomaly.acknowledge",
    "anomaly_event",
    id,
    {},
  );
  return serializeAnomaly(updated as unknown as Record<string, unknown>);
}

// ---- Assign: acknowledged → assigned ----
export async function assignAnomaly(
  id: string,
  data: z.infer<typeof assignAnomalySchema>,
  actorId: string,
  requester?: AuthenticatedUser,
) {
  const anomaly = await prisma.anomalyEvent.findFirst({
    where: {
      id,
      ...(requester?.campusId ? { campusId: requester.campusId } : {}),
    },
  });
  if (!anomaly)
    throw Object.assign(new Error("Anomaly not found"), {
      status: 404,
      code: "NOT_FOUND",
    });
  if (!canAssignAnomalyStatus(anomaly.status)) {
    throw Object.assign(
      new Error(`Cannot assign anomaly in status '${anomaly.status}'`),
      { status: 409, code: "INVALID_TRANSITION" },
    );
  }

  // Verify assignee exists
  const assignee = await prisma.user.findUnique({
    where: { id: data.assignedToId },
  });
  if (!assignee)
    throw Object.assign(new Error("Assignee not found"), {
      status: 404,
      code: "NOT_FOUND",
    });

  const updated = await prisma.anomalyEvent.update({
    where: { id },
    data: {
      status: "assigned",
      assignedToId: data.assignedToId,
    },
    include: anomalyInclude,
  });

  await prisma.anomalyTimelineEntry.create({
    data: {
      anomalyId: id,
      actorId,
      action: "assigned",
      note: data.note ?? `Assigned to ${assignee.username}`,
    },
  });

  emitToCampusNamespace("/classroom", anomaly.campusId, "anomaly:updated", {
    anomalyId: id,
    campusId: anomaly.campusId,
    status: "assigned",
    assignedToId: data.assignedToId,
    actorId,
  });

  await writeAuditEntry(actorId, "anomaly.assign", "anomaly_event", id, {
    assignedToId: data.assignedToId,
  });
  return serializeAnomaly(updated as unknown as Record<string, unknown>);
}

// ---- Resolve: assigned → resolved ----
export async function resolveAnomaly(
  id: string,
  data: z.infer<typeof resolveAnomalySchema>,
  actorId: string,
  requester?: AuthenticatedUser,
) {
  const anomaly = await prisma.anomalyEvent.findFirst({
    where: {
      id,
      ...(requester?.campusId ? { campusId: requester.campusId } : {}),
    },
  });
  if (!anomaly)
    throw Object.assign(new Error("Anomaly not found"), {
      status: 404,
      code: "NOT_FOUND",
    });
  if (!canResolveAnomalyStatus(anomaly.status)) {
    throw Object.assign(
      new Error(`Cannot resolve anomaly in status '${anomaly.status}'`),
      { status: 409, code: "INVALID_TRANSITION" },
    );
  }

  const updated = await prisma.anomalyEvent.update({
    where: { id },
    data: {
      status: "resolved",
      resolvedById: actorId,
      resolvedAt: new Date(),
      resolutionNote: data.resolutionNote,
    },
    include: anomalyInclude,
  });

  await prisma.anomalyTimelineEntry.create({
    data: {
      anomalyId: id,
      actorId,
      action: "resolved",
      note: data.resolutionNote,
    },
  });

  emitToCampusNamespace("/classroom", anomaly.campusId, "anomaly:updated", {
    anomalyId: id,
    campusId: anomaly.campusId,
    status: "resolved",
    actorId,
  });

  await writeAuditEntry(actorId, "anomaly.resolve", "anomaly_event", id, {
    note: data.resolutionNote,
  });
  return serializeAnomaly(updated as unknown as Record<string, unknown>);
}

// ---- Escalate: any active → escalated ----
export async function escalateAnomaly(
  id: string,
  data: z.infer<typeof escalateAnomalySchema>,
  actorId: string,
  requester?: AuthenticatedUser,
) {
  const anomaly = await prisma.anomalyEvent.findFirst({
    where: {
      id,
      ...(requester?.campusId ? { campusId: requester.campusId } : {}),
    },
  });
  if (!anomaly)
    throw Object.assign(new Error("Anomaly not found"), {
      status: 404,
      code: "NOT_FOUND",
    });
  if (!canEscalateAnomalyStatus(anomaly.status)) {
    throw Object.assign(
      new Error(`Cannot escalate anomaly in status '${anomaly.status}'`),
      { status: 409, code: "INVALID_TRANSITION" },
    );
  }

  const updated = await prisma.anomalyEvent.update({
    where: { id },
    data: {
      status: "escalated",
      escalatedAt: new Date(),
    },
    include: anomalyInclude,
  });

  await prisma.anomalyTimelineEntry.create({
    data: {
      anomalyId: id,
      actorId,
      action: "escalated",
      note: data.note,
    },
  });

  emitToCampusNamespace("/classroom", anomaly.campusId, "anomaly:updated", {
    anomalyId: id,
    campusId: anomaly.campusId,
    status: "escalated",
    actorId,
  });
  emitToCampusNamespace("/supervisor-queue", anomaly.campusId, "anomaly:escalated", {
    anomalyId: id,
    classroomId: anomaly.classroomId,
    campusId: anomaly.campusId,
    type: anomaly.type,
    at: new Date().toISOString(),
  });

  await writeAuditEntry(actorId, "anomaly.escalate", "anomaly_event", id, {
    note: data.note,
  });
  return serializeAnomaly(updated as unknown as Record<string, unknown>);
}

// ---- Auto-escalate stale anomalies (called by escalation worker) ----
export async function escalateStaleAnomalies(): Promise<number> {
  const threshold = new Date(
    Date.now() - config.classroom.anomalyEscalationMinutes * 60 * 1000,
  );

  const stale = await prisma.anomalyEvent.findMany({
    where: {
      status: { in: ["open", "acknowledged"] },
      createdAt: { lt: threshold },
    },
    select: { id: true, campusId: true, classroomId: true, type: true },
  });

  for (const anomaly of stale) {
    await prisma.anomalyEvent.update({
      where: { id: anomaly.id },
      data: { status: "escalated", escalatedAt: new Date() },
    });

    await prisma.anomalyTimelineEntry.create({
      data: {
        anomalyId: anomaly.id,
        actorId: null,
        action: "auto_escalated",
        note: `Automatically escalated after ${config.classroom.anomalyEscalationMinutes} minutes without resolution.`,
      },
    });

    emitToCampusNamespace("/classroom", anomaly.campusId, "anomaly:updated", {
      anomalyId: anomaly.id,
      campusId: anomaly.campusId,
      status: "escalated",
    });
    emitToCampusNamespace("/supervisor-queue", anomaly.campusId, "anomaly:escalated", {
      anomalyId: anomaly.id,
      classroomId: anomaly.classroomId,
      campusId: anomaly.campusId,
      type: anomaly.type,
      auto: true,
      at: new Date().toISOString(),
    });
  }

  if (stale.length > 0) {
    logger.info({ msg: "Auto-escalated stale anomalies", count: stale.length });
  }
  return stale.length;
}
