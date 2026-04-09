import { z } from "zod";
import { ParkingAlertStatus, ParkingAlertType } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { emitToCampusNamespace } from "../../lib/socket";
import { logger } from "../../lib/logger";
import { config } from "../../config";
import { writeAuditEntry } from "../admin/audit.service";
import type { AuthenticatedUser } from "../../types";

// ---- Validators ----
export const createAlertSchema = z.object({
  lotId: z.string().uuid(),
  type: z.nativeEnum(ParkingAlertType),
  description: z.string().min(1).max(2000).trim(),
});

export const closeAlertSchema = z.object({
  closureNote: z
    .string()
    .trim()
    .min(5, "Closure note must be at least 5 characters")
    .max(2000),
});

export const escalateAlertSchema = z.object({
  note: z.string().max(500).optional(),
});

// ---- Includes ----
const alertInclude = {
  lot: { select: { id: true, name: true, totalSpaces: true } },
  claimedBy: { select: { id: true, username: true } },
  closedBy: { select: { id: true, username: true } },
  timeline: { orderBy: { createdAt: "asc" as const } },
};

export type ParkingSlaStatus = "within_sla" | "at_risk" | "breached" | "closed";

export function computeParkingSlaStatus(
  slaDeadlineAt: Date | null,
  closedAt: Date | null,
  now: Date = new Date(),
): ParkingSlaStatus {
  if (closedAt) return "closed";
  if (!slaDeadlineAt) return "within_sla";

  const msRemaining = slaDeadlineAt.getTime() - now.getTime();
  if (msRemaining < 0) return "breached";
  if (msRemaining < 180_000) return "at_risk"; // < 3 min
  return "within_sla";
}

export function canClaimParkingAlert(status: string): boolean {
  return status === "open";
}

export function canCloseParkingAlert(status: string): boolean {
  return status === "claimed";
}

export function canEscalateParkingAlert(status: string): boolean {
  return ["open", "claimed"].includes(status);
}

function serializeAlert(a: Record<string, unknown>) {
  const createdAt = a.createdAt as Date;
  const slaDeadlineAt = a.slaDeadlineAt as Date | null;
  const closedAt = a.closedAt as Date | null;
  const now = new Date();
  const slaStatus = computeParkingSlaStatus(slaDeadlineAt, closedAt, now);

  return {
    ...a,
    ageSeconds: Math.floor((now.getTime() - createdAt.getTime()) / 1000),
    slaStatus,
    msToSlaDeadline: slaDeadlineAt
      ? slaDeadlineAt.getTime() - now.getTime()
      : null,
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
}, requester?: AuthenticatedUser) {
  const {
    lotId,
    status,
    type,
    from,
    to,
    search,
    page = 1,
    limit = 50,
  } = params;
  const where: Record<string, unknown> = {};
  if (requester?.campusId) where.campusId = requester.campusId;
  if (lotId) where.lotId = lotId;
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
    where.description = { contains: search };
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.parkingAlert.findMany({
      where: where as any,
      include: alertInclude,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip,
      take: limit,
    }),
    prisma.parkingAlert.count({
      where: where as any,
    }),
  ]);

  return {
    data: items.map((a) =>
      serializeAlert(a as unknown as Record<string, unknown>),
    ),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// ---- Get alert by id ----
export async function getAlertById(id: string, requester?: AuthenticatedUser) {
  const alert = await prisma.parkingAlert.findFirst({
    where: {
      id,
      ...(requester?.campusId ? { campusId: requester.campusId } : {}),
    },
    include: alertInclude,
  });
  if (!alert) return null;
  return serializeAlert(alert as unknown as Record<string, unknown>);
}

// ---- Create alert (with dedup) ----
export async function createAlert(
  data: z.infer<typeof createAlertSchema>,
  actorId: string,
  requester?: AuthenticatedUser,
) {
  const payload = createAlertSchema.parse(data);
  const lot = await prisma.parkingLot.findFirst({
    where: {
      id: payload.lotId,
      ...(requester?.campusId ? { campusId: requester.campusId } : {}),
    },
  });
  if (!lot)
    throw Object.assign(new Error("Lot not found"), {
      status: 404,
      code: "NOT_FOUND",
    });

  // Dedup: overtime and no_plate_captured — one open alert per lot per type
  if (["overtime", "no_plate_captured"].includes(payload.type)) {
    const existing = await prisma.parkingAlert.findFirst({
      where: {
        campusId: lot.campusId,
        lotId: payload.lotId,
        type: payload.type,
        status: { in: ["open", "claimed"] },
      },
    });
    if (existing) {
      throw Object.assign(
        new Error(`An open ${payload.type} alert already exists for this lot`),
        { status: 409, code: "DUPLICATE_ALERT" },
      );
    }
  }

  const slaDeadline = new Date(
    Date.now() + config.parking.alertSlaMinutes * 60 * 1000,
  );

  const createData: Prisma.ParkingAlertUncheckedCreateInput = {
    campusId: lot.campusId,
    lotId: payload.lotId,
    type: payload.type,
    description: payload.description,
    status: "open",
    slaDeadlineAt: slaDeadline,
  };

  const alert = await prisma.parkingAlert.create({
    data: createData,
    include: alertInclude,
  });

  await prisma.parkingAlertTimelineEntry.create({
    data: {
      alertId: alert.id,
      actorId,
      action: "created",
      note: payload.description,
    },
  });

  emitToCampusNamespace("/parking", lot.campusId, "alert:created", {
    alertId: alert.id,
    campusId: lot.campusId,
    lotId: payload.lotId,
    type: payload.type,
    status: "open",
    slaDeadlineAt: slaDeadline.toISOString(),
  });

  await writeAuditEntry(
    actorId,
    "parking_alert.create",
    "parking_alert",
    alert.id,
    { type: payload.type },
  );
  return serializeAlert(alert as unknown as Record<string, unknown>);
}

// ---- Claim: open → claimed ----
export async function claimAlert(id: string, actorId: string, requester?: AuthenticatedUser) {
  const alert = await prisma.parkingAlert.findFirst({
    where: {
      id,
      ...(requester?.campusId ? { campusId: requester.campusId } : {}),
    },
  });
  if (!alert)
    throw Object.assign(new Error("Alert not found"), {
      status: 404,
      code: "NOT_FOUND",
    });
  if (!canClaimParkingAlert(alert.status)) {
    throw Object.assign(
      new Error(`Cannot claim alert in status '${alert.status}'`),
      { status: 409, code: "INVALID_TRANSITION" },
    );
  }

  const updated = await prisma.parkingAlert.update({
    where: { id },
    data: { status: "claimed", claimedById: actorId, claimedAt: new Date() },
    include: alertInclude,
  });

  await prisma.parkingAlertTimelineEntry.create({
    data: { alertId: id, actorId, action: "claimed" },
  });

  emitToCampusNamespace("/parking", alert.campusId, "alert:updated", {
    alertId: id,
    campusId: alert.campusId,
    status: "claimed",
    actorId,
  });
  await writeAuditEntry(
    actorId,
    "parking_alert.claim",
    "parking_alert",
    id,
    {},
  );
  return serializeAlert(updated as unknown as Record<string, unknown>);
}

// ---- Close: claimed → closed (requires closure note) ----
export async function closeAlert(
  id: string,
  data: z.infer<typeof closeAlertSchema>,
  actorId: string,
  requester?: AuthenticatedUser,
) {
  const alert = await prisma.parkingAlert.findFirst({
    where: {
      id,
      ...(requester?.campusId ? { campusId: requester.campusId } : {}),
    },
  });
  if (!alert)
    throw Object.assign(new Error("Alert not found"), {
      status: 404,
      code: "NOT_FOUND",
    });
  if (!canCloseParkingAlert(alert.status)) {
    throw Object.assign(
      new Error(`Cannot close alert in status '${alert.status}'`),
      { status: 409, code: "INVALID_TRANSITION" },
    );
  }

  const now = new Date();
  const updated = await prisma.parkingAlert.update({
    where: { id },
    data: {
      status: "closed",
      closedById: actorId,
      closedAt: now,
      closureNote: data.closureNote,
    },
    include: alertInclude,
  });

  await prisma.parkingAlertTimelineEntry.create({
    data: { alertId: id, actorId, action: "closed", note: data.closureNote },
  });

  emitToCampusNamespace("/parking", alert.campusId, "alert:updated", {
    alertId: id,
    campusId: alert.campusId,
    status: "closed",
    actorId,
  });
  await writeAuditEntry(actorId, "parking_alert.close", "parking_alert", id, {
    closureNote: data.closureNote,
  });
  return serializeAlert(updated as unknown as Record<string, unknown>);
}

// ---- Escalate: any active → escalated ----
export async function escalateAlert(
  id: string,
  data: z.infer<typeof escalateAlertSchema>,
  actorId: string | null,
  requester?: AuthenticatedUser,
) {
  const alert = await prisma.parkingAlert.findFirst({
    where: {
      id,
      ...(requester?.campusId ? { campusId: requester.campusId } : {}),
    },
  });
  if (!alert)
    throw Object.assign(new Error("Alert not found"), {
      status: 404,
      code: "NOT_FOUND",
    });
  if (!canEscalateParkingAlert(alert.status)) {
    throw Object.assign(
      new Error(`Cannot escalate alert in status '${alert.status}'`),
      { status: 409, code: "INVALID_TRANSITION" },
    );
  }

  const updated = await prisma.parkingAlert.update({
    where: { id },
    data: { status: "escalated", escalatedAt: new Date() },
    include: alertInclude,
  });

  await prisma.parkingAlertTimelineEntry.create({
    data: {
      alertId: id,
      actorId,
      action: actorId ? "escalated" : "auto_escalated",
      note:
        data.note ??
        (actorId
          ? null
          : `SLA breached — auto-escalated after ${config.parking.alertSlaMinutes} minutes`),
    },
  });

  emitToCampusNamespace("/parking", alert.campusId, "alert:updated", {
    alertId: id,
    campusId: alert.campusId,
    status: "escalated",
    actorId,
  });
  emitToCampusNamespace("/supervisor-queue", alert.campusId, "parking:alert:escalated", {
    alertId: id,
    campusId: alert.campusId,
    lotId: alert.lotId,
    type: alert.type,
    auto: !actorId,
    at: new Date().toISOString(),
  });

  if (actorId) {
    await writeAuditEntry(
      actorId,
      "parking_alert.escalate",
      "parking_alert",
      id,
      { note: data.note },
    );
  }
  return serializeAlert(updated as unknown as Record<string, unknown>);
}

// ---- Auto-escalate SLA breaches (called by worker every 30s) ----
export async function escalateSlaBreaches(): Promise<number> {
  const now = new Date();
  const breached = await prisma.parkingAlert.findMany({
    where: {
      status: { in: ["open", "claimed"] },
      slaDeadlineAt: { lte: now, not: null },
    },
    select: { id: true, campusId: true, lotId: true, type: true },
  });

  for (const alert of breached) {
    try {
      await escalateAlert(alert.id, {}, null);
    } catch (err) {
      logger.error({
        msg: "Failed to auto-escalate alert",
        alertId: alert.id,
        err,
      });
    }
  }

  if (breached.length > 0) {
    logger.warn({
      msg: "Auto-escalated SLA-breached parking alerts",
      count: breached.length,
    });
  }
  return breached.length;
}

// ---- Metrics ----
export async function getAlertMetrics(lotId?: string, requester?: AuthenticatedUser) {
  const where: Record<string, unknown> = {};
  if (requester?.campusId) where.campusId = requester.campusId;
  if (lotId) where.lotId = lotId;

  const oneHourAgo = new Date(Date.now() - 3_600_000);
  const [totalOpen, totalEscalated, createdLastHour, closedWithTime] =
    await Promise.all([
      prisma.parkingAlert.count({
        where: { ...where, status: { in: ["open", "claimed"] } },
      }),
      prisma.parkingAlert.count({ where: { ...where, status: "escalated" } }),
      prisma.parkingAlert.count({
        where: {
          ...(where as Record<string, unknown>),
          createdAt: { gte: oneHourAgo },
        },
      }),
      prisma.parkingAlert.findMany({
        where: { ...where, status: "closed", closedAt: { not: null } },
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
    openAlerts: totalOpen,
    escalatedAlerts: totalEscalated,
    creationRatePerHour: createdLastHour,
    meanTimeToCloseMin: mttcMinutes,
    totalClosed: closedWithTime.length,
  };
}
