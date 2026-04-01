import { AnomalyEventStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { emitToNamespace } from "../../lib/socket";
import { logger } from "../../lib/logger";
import { config } from "../../config";
import { writeAuditEntry } from "../admin/audit.service";

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
    .min(10, "Resolution note must be at least 10 characters")
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
}) {
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
export async function getAnomalyById(id: string) {
  const anomaly = await prisma.anomalyEvent.findUnique({
    where: { id },
    include: anomalyInclude,
  });
  if (!anomaly) return null;
  return serializeAnomaly(anomaly as unknown as Record<string, unknown>);
}

// ---- Create anomaly (admin / system) ----
export async function createAnomaly(
  data: z.infer<typeof createAnomalySchema>,
  actorId: string,
) {
  const payload = createAnomalySchema.parse(data);
  const classroom = await prisma.classroom.findUnique({
    where: { id: payload.classroomId },
  });
  if (!classroom)
    throw Object.assign(new Error("Classroom not found"), {
      status: 404,
      code: "NOT_FOUND",
    });

  const createData: Prisma.AnomalyEventUncheckedCreateInput = {
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

  emitToNamespace("/classroom", "anomaly:created", {
    anomalyId: anomaly.id,
    classroomId: anomaly.classroomId,
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
export async function acknowledgeAnomaly(id: string, actorId: string) {
  const anomaly = await prisma.anomalyEvent.findUnique({ where: { id } });
  if (!anomaly)
    throw Object.assign(new Error("Anomaly not found"), {
      status: 404,
      code: "NOT_FOUND",
    });
  if (anomaly.status !== "open") {
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

  emitToNamespace("/classroom", "anomaly:updated", {
    anomalyId: id,
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
) {
  const anomaly = await prisma.anomalyEvent.findUnique({ where: { id } });
  if (!anomaly)
    throw Object.assign(new Error("Anomaly not found"), {
      status: 404,
      code: "NOT_FOUND",
    });
  if (anomaly.status !== "acknowledged") {
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

  emitToNamespace("/classroom", "anomaly:updated", {
    anomalyId: id,
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
) {
  const anomaly = await prisma.anomalyEvent.findUnique({ where: { id } });
  if (!anomaly)
    throw Object.assign(new Error("Anomaly not found"), {
      status: 404,
      code: "NOT_FOUND",
    });
  if (anomaly.status !== "assigned") {
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

  emitToNamespace("/classroom", "anomaly:updated", {
    anomalyId: id,
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
) {
  const anomaly = await prisma.anomalyEvent.findUnique({ where: { id } });
  if (!anomaly)
    throw Object.assign(new Error("Anomaly not found"), {
      status: 404,
      code: "NOT_FOUND",
    });
  if (!["open", "acknowledged", "assigned"].includes(anomaly.status)) {
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

  emitToNamespace("/classroom", "anomaly:updated", {
    anomalyId: id,
    status: "escalated",
    actorId,
  });
  emitToNamespace("/supervisor-queue", "anomaly:escalated", {
    anomalyId: id,
    classroomId: anomaly.classroomId,
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
    select: { id: true, classroomId: true, type: true },
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

    emitToNamespace("/classroom", "anomaly:updated", {
      anomalyId: anomaly.id,
      status: "escalated",
    });
    emitToNamespace("/supervisor-queue", "anomaly:escalated", {
      anomalyId: anomaly.id,
      classroomId: anomaly.classroomId,
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
