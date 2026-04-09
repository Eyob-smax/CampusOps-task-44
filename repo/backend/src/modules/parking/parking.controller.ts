import { Request, Response, NextFunction } from 'express';
import {
  listLots,
  getLotStats,
  getDashboardStats,
  recordEntry,
  recordExit,
  listSessions,
  recordEntrySchema,
  recordExitSchema,
} from './parking.service';

export async function getLotsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const lots = await listLots({ activeOnly: req.query.active !== 'false', search: req.query.search as string }, req.user);
    res.json({ success: true, data: lots });
  } catch (err) { next(err); }
}

export async function getLotStatsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await getLotStats(req.params.id, req.user);
    if (!stats) { res.status(404).json({ success: false, error: 'Lot not found', code: 'NOT_FOUND' }); return; }
    res.json({ success: true, data: stats });
  } catch (err) { next(err); }
}

export async function getDashboardHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await getDashboardStats(req.user) });
  } catch (err) { next(err); }
}

export async function recordEntryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = recordEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Validation error', code: 'VALIDATION_ERROR', details: parsed.error.errors });
      return;
    }
    const session = await recordEntry(parsed.data);
    res.status(201).json({ success: true, data: session });
  } catch (err) { next(err); }
}

export async function recordExitHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = recordExitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Validation error', code: 'VALIDATION_ERROR', details: parsed.error.errors });
      return;
    }
    const session = await recordExit(parsed.data.sessionId);
    res.json({ success: true, data: session });
  } catch (err) { next(err); }
}

export async function getSessionsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await listSessions({
      lotId:       req.query.lotId as string,
      plateNumber: req.query.plateNumber as string,
      active:      req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined,
      from:        req.query.from as string,
      to:          req.query.to as string,
      page:        req.query.page  ? parseInt(req.query.page as string, 10)  : 1,
      limit:       req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
    }, req.user);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}
