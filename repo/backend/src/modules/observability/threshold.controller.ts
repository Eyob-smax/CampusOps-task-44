import { Request, Response, NextFunction } from 'express';
import {
  listThresholds,
  getThresholdById,
  createThreshold,
  updateThreshold,
  deleteThreshold,
  createThresholdSchema,
  updateThresholdSchema,
} from './threshold.service';

export async function listThresholdsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const thresholds = await listThresholds();
    res.json({ success: true, data: thresholds });
  } catch (err) {
    next(err);
  }
}

export async function getThresholdByIdHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const threshold = await getThresholdById(req.params.id);
    res.json({ success: true, data: threshold });
  } catch (err) {
    next(err);
  }
}

export async function createThresholdHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createThresholdSchema.safeParse(req.body);
    if (!parsed.success) {
      const err: any = new Error('Validation failed');
      err.status = 422;
      err.code = 'VALIDATION_ERROR';
      err.details = parsed.error.flatten();
      throw err;
    }
    const actorId = (req as any).user?.id ?? 'unknown';
    const threshold = await createThreshold(parsed.data, actorId);
    res.status(201).json({ success: true, data: threshold });
  } catch (err) {
    next(err);
  }
}

export async function updateThresholdHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = updateThresholdSchema.safeParse(req.body);
    if (!parsed.success) {
      const err: any = new Error('Validation failed');
      err.status = 422;
      err.code = 'VALIDATION_ERROR';
      err.details = parsed.error.flatten();
      throw err;
    }
    const actorId = (req as any).user?.id ?? 'unknown';
    const updated = await updateThreshold(req.params.id, parsed.data, actorId);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

export async function deleteThresholdHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const actorId = (req as any).user?.id ?? 'unknown';
    await deleteThreshold(req.params.id, actorId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
