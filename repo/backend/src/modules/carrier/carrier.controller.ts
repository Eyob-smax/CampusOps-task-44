import { Request, Response, NextFunction } from 'express';
import {
  listCarriers,
  getCarrierById,
  createCarrier,
  updateCarrier,
  createCarrierSchema,
  updateCarrierSchema,
} from './carrier.service';

export async function getCarriers(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listCarriers();
    res.json(data);
  } catch (err) { next(err); }
}

export async function getCarrier(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getCarrierById(req.params.id);
    res.json(data);
  } catch (err) { next(err); }
}

export async function createCarrierHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createCarrierSchema.parse(req.body);
    const data = await createCarrier(body);
    res.status(201).json(data);
  } catch (err) { next(err); }
}

export async function updateCarrierHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = updateCarrierSchema.parse(req.body);
    const data = await updateCarrier(req.params.id, body);
    res.json(data);
  } catch (err) { next(err); }
}
