import { Request, Response, NextFunction } from 'express';
import {
  listTiers,
  getTierById,
  createTier,
  updateTier,
  createTierSchema,
  updateTierSchema,
} from './membership.service';

export async function getTiers(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listTiers();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getTier(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getTierById(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createTierHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createTierSchema.parse(req.body);
    const data = await createTier(body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateTierHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = updateTierSchema.parse(req.body);
    const data = await updateTier(req.params.id, body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}
