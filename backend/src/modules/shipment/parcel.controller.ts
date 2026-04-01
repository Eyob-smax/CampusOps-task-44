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
    if (!shipmentId) {
      res.status(400).json({ success: false, error: 'shipmentId query parameter is required', code: 'MISSING_PARAM' });
      return;
    }
    res.json(await listParcels(shipmentId));
  } catch (err) {
    next(err);
  }
}

export async function getParcelHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await getParcelById(req.params.id));
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
    res.status(201).json(await addParcel(shipmentId, data, actorId));
  } catch (err) {
    next(err);
  }
}

export async function updateParcelStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = updateParcelStatusSchema.parse(req.body);
    const actorId    = (req as any).user?.id ?? 'system';
    res.json(await updateParcelStatus(req.params.id, status, actorId));
  } catch (err) {
    next(err);
  }
}
