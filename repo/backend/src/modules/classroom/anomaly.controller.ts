import { Request, Response, NextFunction } from 'express';
import {
  listAnomalies,
  getAnomalyById,
  createAnomaly,
  acknowledgeAnomaly,
  assignAnomaly,
  resolveAnomaly,
  escalateAnomaly,
  createAnomalySchema,
  assignAnomalySchema,
  resolveAnomalySchema,
  escalateAnomalySchema,
} from './anomaly.service';
import type { AnomalyEventStatus } from '@prisma/client';

export async function getAnomaliesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const statusParam = req.query.status as string | undefined;
    const status = statusParam?.includes(',')
      ? (statusParam.split(',') as AnomalyEventStatus[])
      : (statusParam as AnomalyEventStatus | undefined);

    const result = await listAnomalies({
      classroomId: req.query.classroomId as string | undefined,
      status,
      type:        req.query.type as string | undefined,
      search:      req.query.search as string | undefined,
      from:        req.query.from as string | undefined,
      to:          req.query.to as string | undefined,
      page:        req.query.page  ? parseInt(req.query.page as string, 10)  : 1,
      limit:       req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getAnomalyHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const anomaly = await getAnomalyById(req.params.id);
    if (!anomaly) {
      res.status(404).json({ success: false, error: 'Anomaly not found', code: 'NOT_FOUND' });
      return;
    }
    res.json({ success: true, data: anomaly });
  } catch (err) {
    next(err);
  }
}

export async function createAnomalyHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createAnomalySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Validation error', code: 'VALIDATION_ERROR', details: parsed.error.errors });
      return;
    }
    const anomaly = await createAnomaly(parsed.data, req.user!.id);
    res.status(201).json({ success: true, data: anomaly });
  } catch (err) {
    next(err);
  }
}

export async function acknowledgeAnomalyHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const anomaly = await acknowledgeAnomaly(req.params.id, req.user!.id);
    res.json({ success: true, data: anomaly });
  } catch (err) {
    next(err);
  }
}

export async function assignAnomalyHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = assignAnomalySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Validation error', code: 'VALIDATION_ERROR', details: parsed.error.errors });
      return;
    }
    const anomaly = await assignAnomaly(req.params.id, parsed.data, req.user!.id);
    res.json({ success: true, data: anomaly });
  } catch (err) {
    next(err);
  }
}

export async function resolveAnomalyHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = resolveAnomalySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Validation error', code: 'VALIDATION_ERROR', details: parsed.error.errors });
      return;
    }
    const anomaly = await resolveAnomaly(req.params.id, parsed.data, req.user!.id);
    res.json({ success: true, data: anomaly });
  } catch (err) {
    next(err);
  }
}

export async function escalateAnomalyHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = escalateAnomalySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Validation error', code: 'VALIDATION_ERROR', details: parsed.error.errors });
      return;
    }
    const anomaly = await escalateAnomaly(req.params.id, parsed.data, req.user!.id);
    res.json({ success: true, data: anomaly });
  } catch (err) {
    next(err);
  }
}
