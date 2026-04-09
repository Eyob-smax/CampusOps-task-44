import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { writeAuditEntry } from '../admin/audit.service';
import { logger } from '../../lib/logger';
import type { AuthenticatedUser } from '../../types';

// ---- Zod schema ----

export const addParcelSchema = z.object({
  trackingNumber: z.string().min(1).max(100),
  weightLb:       z.number().positive().optional(),
  description:    z.string().max(500).optional(),
});

export const updateParcelStatusSchema = z.object({
  status: z.enum(['pending', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'returned']),
});

export function scopedShipmentWhere(requester?: AuthenticatedUser): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (requester?.campusId) {
    where['campusId'] = requester.campusId;
  }

  if (requester?.role === 'customer_service_agent') {
    where['fulfillmentRequest'] = { createdById: requester.id };
  }

  return where;
}

// ---- Service functions ----

export async function listParcels(shipmentId?: string, requester?: AuthenticatedUser) {
  if (shipmentId) {
    const shipment = await prisma.shipment.findFirst({
      where: {
        id: shipmentId,
        ...scopedShipmentWhere(requester),
      } as any,
    });
    if (!shipment) {
      const err: any = new Error('Shipment not found');
      err.status = 404;
      err.code   = 'SHIPMENT_NOT_FOUND';
      throw err;
    }
  }

  const where: Record<string, unknown> = shipmentId ? { shipmentId } : {};
  const shipmentScope = scopedShipmentWhere(requester);
  if (Object.keys(shipmentScope).length > 0) {
    where['shipment'] = shipmentScope;
  }

  return prisma.parcel.findMany({
    where: where as any,
    orderBy: { createdAt: 'asc' },
  });
}

export async function getParcelById(id: string, requester?: AuthenticatedUser) {
  const where: Record<string, unknown> = { id };
  const shipmentScope = scopedShipmentWhere(requester);
  if (Object.keys(shipmentScope).length > 0) {
    where['shipment'] = shipmentScope;
  }

  const parcel = await prisma.parcel.findFirst({
    where: where as any,
    include: { shipment: true, afterSalesTickets: true },
  });
  if (!parcel) {
    const err: any = new Error('Parcel not found');
    err.status = 404;
    err.code   = 'PARCEL_NOT_FOUND';
    throw err;
  }
  return parcel;
}

export async function addParcel(
  shipmentId: string,
  data:       z.infer<typeof addParcelSchema>,
  actorId:    string,
  requester?: AuthenticatedUser,
) {
  const shipment = await prisma.shipment.findFirst({
    where: {
      id: shipmentId,
      ...scopedShipmentWhere(requester),
    } as any,
  });
  if (!shipment) {
    const err: any = new Error('Shipment not found');
    err.status = 404;
    err.code   = 'SHIPMENT_NOT_FOUND';
    throw err;
  }

  // Check uniqueness of tracking number
  const existing = await prisma.parcel.findUnique({ where: { trackingNumber: data.trackingNumber } });
  if (existing) {
    const err: any = new Error('Tracking number already exists');
    err.status = 409;
    err.code   = 'TRACKING_NUMBER_CONFLICT';
    throw err;
  }

  const parcel = await prisma.parcel.create({
    data: {
      shipmentId,
      trackingNumber: data.trackingNumber,
      weightLb:       data.weightLb,
      description:    data.description,
      status:         'pending',
    },
  });

  await writeAuditEntry(
    actorId,
    'parcel.create',
    'Parcel',
    parcel.id,
    { shipmentId, trackingNumber: data.trackingNumber },
  );

  logger.info({ msg: 'Parcel added', parcelId: parcel.id, shipmentId, actorId });
  return parcel;
}

export async function updateParcelStatus(
  id:      string,
  status:  string,
  actorId: string,
  requester?: AuthenticatedUser,
) {
  const parcel = await getParcelById(id, requester);

  const updated = await prisma.parcel.update({
    where: { id },
    data:  { status: status as any },
  });

  await writeAuditEntry(
    actorId,
    'parcel.statusUpdate',
    'Parcel',
    id,
    { from: parcel.status, to: status, shipmentId: parcel.shipmentId },
  );

  logger.info({ msg: 'Parcel status updated', parcelId: id, from: parcel.status, to: status });
  return updated;
}
