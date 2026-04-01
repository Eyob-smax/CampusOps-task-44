import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  listShipments,
  getShipmentById,
  createShipment,
  updateShipmentStatus,
  triggerCarrierSync,
  createShipmentSchema,
} from './shipment.service';

const updateStatusSchema = z.object({
  status: z.enum(['pending', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'returned']),
});

export async function listShipmentsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { fulfillmentRequestId, carrierId, warehouseId, status, page, limit } = req.query as any;
    const data = await listShipments({
      fulfillmentRequestId,
      carrierId,
      warehouseId,
      status,
      page:  page  ? Number(page)  : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getShipmentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getShipmentById(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function createShipmentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body    = createShipmentSchema.parse(req.body);
    const actorId = (req as any).user?.id ?? 'system';
    const data = await createShipment(body, actorId);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = updateStatusSchema.parse(req.body);
    const actorId    = (req as any).user?.id ?? 'system';
    const data = await updateShipmentStatus(req.params.id, status, actorId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function triggerSyncHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await triggerCarrierSync(req.params.carrierId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
