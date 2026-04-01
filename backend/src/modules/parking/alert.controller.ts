import { Request, Response, NextFunction } from 'express';
import {
  listAlerts,
  getAlertById,
  createAlert,
  claimAlert,
  closeAlert,
  escalateAlert,
  getAlertMetrics,
  createAlertSchema,
  closeAlertSchema,
  escalateAlertSchema,
} from './alert.service';
import type { ParkingAlertStatus, ParkingAlertType } from '@prisma/client';

export async function getAlertsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const statusParam = req.query.status as string | undefined;
    const status = statusParam?.includes(',')
      ? (statusParam.split(',') as ParkingAlertStatus[])
      : (statusParam as ParkingAlertStatus | undefined);
    const result = await listAlerts({
      lotId:  req.query.lotId  as string,
      type:   req.query.type   as ParkingAlertType,
      status,
      search: req.query.search as string,
      from:   req.query.from   as string,
      to:     req.query.to     as string,
      page:   req.query.page   ? parseInt(req.query.page  as string, 10) : 1,
      limit:  req.query.limit  ? parseInt(req.query.limit as string, 10) : 50,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function getAlertHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const alert = await getAlertById(req.params.id);
    if (!alert) { res.status(404).json({ success: false, error: 'Alert not found', code: 'NOT_FOUND' }); return; }
    res.json({ success: true, data: alert });
  } catch (err) { next(err); }
}

export async function createAlertHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createAlertSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ success: false, error: 'Validation error', code: 'VALIDATION_ERROR', details: parsed.error.errors }); return; }
    const alert = await createAlert(parsed.data, req.user!.id);
    res.status(201).json({ success: true, data: alert });
  } catch (err) { next(err); }
}

export async function claimAlertHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await claimAlert(req.params.id, req.user!.id) });
  } catch (err) { next(err); }
}

export async function closeAlertHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = closeAlertSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ success: false, error: 'Validation error', code: 'VALIDATION_ERROR', details: parsed.error.errors }); return; }
    res.json({ success: true, data: await closeAlert(req.params.id, parsed.data, req.user!.id) });
  } catch (err) { next(err); }
}

export async function escalateAlertHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = escalateAlertSchema.safeParse(req.body ?? {});
    if (!parsed.success) { res.status(400).json({ success: false, error: 'Validation error', code: 'VALIDATION_ERROR', details: parsed.error.errors }); return; }
    res.json({ success: true, data: await escalateAlert(req.params.id, parsed.data, req.user!.id) });
  } catch (err) { next(err); }
}

export async function getMetricsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await getAlertMetrics(req.query.lotId as string) });
  } catch (err) { next(err); }
}
