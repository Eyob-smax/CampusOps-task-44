import { z } from "zod";
import { Queue } from "bullmq";
import { prisma } from "../../lib/prisma";
import { writeAuditEntry } from "../admin/audit.service";
import { emitToNamespace } from "../../lib/socket";
import { getRedisClient } from "../../lib/redis";
import { logger } from "../../lib/logger";

const connection = { connection: getRedisClient() };
const shipmentSyncQueue = new Queue("campusops-shipment-sync", connection);

// ---- Zod schema ----

export const createShipmentSchema = z.object({
  fulfillmentRequestId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  carrierId: z.string().uuid(),
  estimatedDeliveryAt: z.string().datetime().optional(),
});

// ---- Valid status transitions ----

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["in_transit", "exception", "returned"],
  in_transit: ["out_for_delivery", "exception", "returned"],
  out_for_delivery: ["delivered", "exception", "returned"],
  delivered: [],
  exception: ["in_transit", "returned"],
  returned: [],
};

// ---- Service functions ----

export async function listShipments(params: {
  fulfillmentRequestId?: string;
  carrierId?: string;
  warehouseId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const where: any = {};
  if (params.fulfillmentRequestId)
    where.fulfillmentRequestId = params.fulfillmentRequestId;
  if (params.carrierId) where.carrierId = params.carrierId;
  if (params.warehouseId) where.warehouseId = params.warehouseId;
  if (params.status) where.status = params.status;

  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const skip = (page - 1) * limit;

  const [total, items] = await Promise.all([
    prisma.shipment.count({ where }),
    prisma.shipment.findMany({
      where,
      include: { carrier: true, warehouse: true, fulfillmentRequest: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return { total, page, limit, items };
}

export async function getShipmentById(id: string) {
  const shipment = await prisma.shipment.findUnique({
    where: { id },
    include: {
      carrier: true,
      warehouse: true,
      fulfillmentRequest: true,
      parcels: true,
      afterSalesTickets: true,
    },
  });
  if (!shipment) {
    const err: any = new Error("Shipment not found");
    err.status = 404;
    err.code = "SHIPMENT_NOT_FOUND";
    throw err;
  }
  return shipment;
}

export async function createShipment(
  data: z.infer<typeof createShipmentSchema>,
  actorId: string,
) {
  // Validate fulfillment request exists
  const fr = await prisma.fulfillmentRequest.findUnique({
    where: { id: data.fulfillmentRequestId },
  });
  if (!fr) {
    const err: any = new Error("Fulfillment request not found");
    err.status = 404;
    err.code = "FULFILLMENT_NOT_FOUND";
    throw err;
  }

  // Check shipment doesn't already exist for this fulfillment request
  const existing = await prisma.shipment.findUnique({
    where: { fulfillmentRequestId: data.fulfillmentRequestId },
  });
  if (existing) {
    const err: any = new Error(
      "A shipment already exists for this fulfillment request",
    );
    err.status = 409;
    err.code = "SHIPMENT_ALREADY_EXISTS";
    throw err;
  }

  const shipment = await prisma.shipment.create({
    data: {
      fulfillmentRequestId: data.fulfillmentRequestId,
      warehouseId: data.warehouseId,
      carrierId: data.carrierId,
      estimatedDeliveryAt: data.estimatedDeliveryAt
        ? new Date(data.estimatedDeliveryAt)
        : undefined,
      status: "pending",
    },
    include: { carrier: true, warehouse: true, fulfillmentRequest: true },
  });

  await writeAuditEntry(actorId, "shipment.create", "Shipment", shipment.id, {
    fulfillmentRequestId: data.fulfillmentRequestId,
    carrierId: data.carrierId,
    warehouseId: data.warehouseId,
  });

  logger.info({ msg: "Shipment created", shipmentId: shipment.id, actorId });
  return shipment;
}

export async function updateShipmentStatus(
  id: string,
  status: string,
  actorId: string,
) {
  const shipment = await getShipmentById(id);

  const allowed = VALID_TRANSITIONS[shipment.status] ?? [];
  if (!allowed.includes(status)) {
    const err: any = new Error(
      `Cannot transition from '${shipment.status}' to '${status}'`,
    );
    err.status = 422;
    err.code = "INVALID_STATUS_TRANSITION";
    throw err;
  }

  const updateData: any = { status };
  if (status === "delivered") {
    updateData.deliveredAt = new Date();
  }

  const updated = await prisma.shipment.update({
    where: { id },
    data: updateData,
    include: {
      carrier: true,
      warehouse: true,
      fulfillmentRequest: true,
      parcels: true,
    },
  });

  await writeAuditEntry(actorId, "shipment.statusUpdate", "Shipment", id, {
    from: shipment.status,
    to: status,
  });

  emitToNamespace("/alerts", "shipment:updated", {
    shipmentId: id,
    status,
    deliveredAt: updated.deliveredAt ?? null,
    timestamp: new Date().toISOString(),
  });

  logger.info({
    msg: "Shipment status updated",
    shipmentId: id,
    from: shipment.status,
    to: status,
  });
  return updated;
}

export async function triggerCarrierSync(carrierId: string) {
  // Validate carrier exists
  const carrier = await prisma.carrier.findUnique({ where: { id: carrierId } });
  if (!carrier) {
    const err: any = new Error("Carrier not found");
    err.status = 404;
    err.code = "CARRIER_NOT_FOUND";
    throw err;
  }

  const job = await shipmentSyncQueue.add(
    "sync-carrier",
    { carrierId },
    { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
  );

  logger.info({ msg: "Carrier sync job queued", carrierId, jobId: job.id });
  return { jobId: job.id, carrierId };
}
