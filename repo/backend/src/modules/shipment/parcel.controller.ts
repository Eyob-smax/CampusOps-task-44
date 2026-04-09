import { Request, Response, NextFunction } from 'express';
import {
  listParcels,
  getParcelById,
  addParcel,
  updateParcelStatus,
  addParcelSchema,
  updateParcelStatusSchema,
} from './parcel.service';

export async function listParcelsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { shipmentId } = req.query as any;
    const data = await listParcels(shipmentId, req.user);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getParcelHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getParcelById(req.params.id, req.user);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function addParcelHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { shipmentId, ...rest } = req.body;
    if (!shipmentId) {
      res.status(400).json({ success: false, error: 'shipmentId is required in request body', code: 'MISSING_PARAM' });
      return;
    }
    const data    = addParcelSchema.parse(rest);
    const actorId = (req as any).user?.id ?? 'system';
    const created = await addParcel(shipmentId, data, actorId, req.user);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
}

export async function updateParcelStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = updateParcelStatusSchema.parse(req.body);
    const actorId    = (req as any).user?.id ?? 'system';
    const data = await updateParcelStatus(req.params.id, status, actorId, req.user);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
