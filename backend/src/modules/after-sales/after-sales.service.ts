import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { writeAuditEntry } from "../admin/audit.service";
import { logger } from "../../lib/logger";

// ---- SLA map (hours) ----

const SLA_HOURS: Record<string, number> = {
  delay: 72,
  dispute: 48,
  lost_item: 96,
};

// ---- Zod schemas ----

export const createTicketSchema = z.object({
  studentId: z.string().uuid(),
  shipmentId: z.string().uuid().optional(),
  parcelId: z.string().uuid().optional(),
  type: z.enum(["delay", "dispute", "lost_item"]),
  description: z.string().min(1),
});

export const updateTicketStatusSchema = z.object({
  status: z.enum([
    "open",
    "under_review",
    "pending_approval",
    "resolved",
    "closed",
  ]),
  note: z.string().optional(),
});

// ---- Valid status transitions ----

const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ["under_review", "closed"],
  under_review: ["pending_approval", "closed"],
  pending_approval: ["resolved", "closed"],
  resolved: ["closed"],
  closed: [],
};

// ---- Service functions ----

export async function listTickets(params: {
  studentId?: string;
  type?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const where: any = {};
  if (params.studentId) where.studentId = params.studentId;
  if (params.type) where.type = params.type;
  if (params.status) where.status = params.status;

  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const skip = (page - 1) * limit;

  const [total, items] = await Promise.all([
    prisma.afterSalesTicket.count({ where }),
    prisma.afterSalesTicket.findMany({
      where,
      include: { student: true, shipment: true, parcel: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return { total, page, limit, items };
}

export async function getTicketById(id: string) {
  const ticket = await prisma.afterSalesTicket.findUnique({
    where: { id },
    include: {
      student: true,
      shipment: true,
      parcel: true,
      evidenceFiles: true,
      timeline: { orderBy: { createdAt: "asc" } },
      compensations: true,
    },
  });
  if (!ticket) {
    const err: any = new Error("After-sales ticket not found");
    err.status = 404;
    err.code = "TICKET_NOT_FOUND";
    throw err;
  }
  return ticket;
}

export async function createTicket(
  data: z.infer<typeof createTicketSchema>,
  actorId: string,
) {
  const slaHours = SLA_HOURS[data.type] ?? 72;
  const slaDeadlineAt = new Date(Date.now() + slaHours * 60 * 60 * 1000);

  const ticket = await prisma.afterSalesTicket.create({
    data: {
      studentId: data.studentId,
      shipmentId: data.shipmentId,
      parcelId: data.parcelId,
      type: data.type,
      status: "open",
      description: data.description,
      slaDeadlineAt,
    },
    include: { student: true, shipment: true, parcel: true },
  });

  // Opening timeline entry
  await prisma.ticketTimelineEntry.create({
    data: {
      ticketId: ticket.id,
      actorId,
      action: "ticket_opened",
      note: `Ticket created with type: ${data.type}`,
    },
  });

  await writeAuditEntry(
    actorId,
    "after-sales.create",
    "AfterSalesTicket",
    ticket.id,
    {
      type: data.type,
      studentId: data.studentId,
      slaDeadlineAt: slaDeadlineAt.toISOString(),
    },
  );

  logger.info({
    msg: "After-sales ticket created",
    ticketId: ticket.id,
    type: data.type,
    actorId,
  });

  // Auto-suggest compensation for delay type
  if (data.type === "delay") {
    try {
      const { suggestCompensation } = await import("./compensation.service");
      await suggestCompensation(ticket.id, actorId);
    } catch (compErr) {
      logger.warn({
        msg: "Auto compensation suggestion failed",
        ticketId: ticket.id,
        err: compErr,
      });
    }
  }

  return ticket;
}

export async function updateTicketStatus(
  id: string,
  status: string,
  actorId: string,
  note?: string,
) {
  const ticket = await getTicketById(id);

  const allowed = VALID_TRANSITIONS[ticket.status] ?? [];
  if (!allowed.includes(status)) {
    const err: any = new Error(
      `Cannot transition from '${ticket.status}' to '${status}'`,
    );
    err.status = 422;
    err.code = "INVALID_STATUS_TRANSITION";
    throw err;
  }

  const updateData: any = { status };
  if (status === "resolved") {
    updateData.resolvedAt = new Date();
  }

  const updated = await prisma.afterSalesTicket.update({
    where: { id },
    data: updateData,
    include: { student: true, shipment: true, parcel: true },
  });

  // Timeline entry
  await prisma.ticketTimelineEntry.create({
    data: {
      ticketId: id,
      actorId,
      action: `status_changed_to_${status}`,
      note: note ?? `Status updated from ${ticket.status} to ${status}`,
    },
  });

  await writeAuditEntry(
    actorId,
    "after-sales.statusUpdate",
    "AfterSalesTicket",
    id,
    { from: ticket.status, to: status, note },
  );

  logger.info({
    msg: "Ticket status updated",
    ticketId: id,
    from: ticket.status,
    to: status,
  });
  return updated;
}

// ---- SLA computation ----

export function computeSlaStatus(ticket: {
  slaDeadlineAt: Date;
  resolvedAt?: Date | null;
  status: string;
}): "within_sla" | "at_risk" | "breached" | "closed" {
  if (ticket.status === "closed" || ticket.status === "resolved") {
    return "closed";
  }

  const now = Date.now();
  const deadlineMs = ticket.slaDeadlineAt.getTime();
  const remainingMs = deadlineMs - now;
  const atRiskMs = 4 * 60 * 60 * 1000; // 4 hours

  if (remainingMs <= 0) return "breached";
  if (remainingMs < atRiskMs) return "at_risk";
  return "within_sla";
}
