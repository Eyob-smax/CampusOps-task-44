import { Request, Response, NextFunction } from 'express';
import { searchLogs } from './log.service';

export async function searchLogsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      service,
      severity,
      correlationId,
      actor,
      domain,
      from,
      to,
      search,
      page,
      limit,
    } = req.query as Record<string, string | undefined>;

    const result = await searchLogs({
      service,
      severity,
      correlationId,
      actor,
      domain,
      from,
      to,
      search,
      page:  page  ? parseInt(page, 10)  : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}
