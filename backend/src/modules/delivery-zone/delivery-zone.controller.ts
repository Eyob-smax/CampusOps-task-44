import { Request, Response, NextFunction } from 'express';
import {
  listZones,
  getZoneById,
  createZone,
  updateZone,
  addZipCode,
  removeZipCode,
  checkZipServiceability,
  createZoneSchema,
  updateZoneSchema,
  addZipSchema,
} from './delivery-zone.service';

export async function getZones(req: Request, res: Response, next: NextFunction) {
  try { res.json(await listZones()); } catch (err) { next(err); }
}

export async function getZone(req: Request, res: Response, next: NextFunction) {
  try { res.json(await getZoneById(req.params.id)); } catch (err) { next(err); }
}

export async function createZoneHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createZoneSchema.parse(req.body);
    res.status(201).json(await createZone(body));
  } catch (err) { next(err); }
}

export async function updateZoneHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = updateZoneSchema.parse(req.body);
    res.json(await updateZone(req.params.id, body));
  } catch (err) { next(err); }
}

export async function addZipHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = addZipSchema.parse(req.body);
    res.status(201).json(await addZipCode(req.params.id, body));
  } catch (err) { next(err); }
}

export async function removeZipHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await removeZipCode(req.params.id, req.params.zipCode));
  } catch (err) { next(err); }
}

export async function checkZipHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await checkZipServiceability(req.params.zipCode));
  } catch (err) { next(err); }
}
