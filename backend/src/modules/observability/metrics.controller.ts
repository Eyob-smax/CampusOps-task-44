import { Request, Response, NextFunction } from 'express';
import {
  getLatestMetrics,
  getMetricHistory,
  listAlertHistory,
  acknowledgeAlert,
} from './metrics.service';

export async function getLatestMetricsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const metrics = await getLatestMetrics();
    res.json({ data: metrics });
  } catch (err) {
    next(err);
  }
}

export async function getMetricHistoryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { name } = req.params;
    const { from, to, limit } = req.query as Record<string, string | undefined>;
    const history = await getMetricHistory(
      name,
      from,
      to,
      limit ? parseInt(limit, 10) : undefined,
    );
    res.json({ data: history });
  } catch (err) {
    next(err);
  }
}

export async function listAlertHistoryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { acknowledged, from, to, page, limit } = req.query as Record<string, string | undefined>;

    const result = await listAlertHistory({
      acknowledged: acknowledged !== undefined ? acknowledged === 'true' : undefined,
      from,
      to,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function acknowledgeAlertHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const actorId = (req as any).user?.id ?? 'unknown';
    const updated = await acknowledgeAlert(id, actorId);
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
}
