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
  try { res.json(await listTiers()); } catch (err) { next(err); }
}

export async function getTier(req: Request, res: Response, next: NextFunction) {
  try { res.json(await getTierById(req.params.id)); } catch (err) { next(err); }
}

export async function createTierHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createTierSchema.parse(req.body);
    res.status(201).json(await createTier(body));
  } catch (err) { next(err); }
}

export async function updateTierHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = updateTierSchema.parse(req.body);
    res.json(await updateTier(req.params.id, body));
  } catch (err) { next(err); }
}
