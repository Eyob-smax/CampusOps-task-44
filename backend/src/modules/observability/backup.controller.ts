import { Request, Response, NextFunction } from 'express';
import {
  listBackups,
  getBackupById,
  runBackup,
  verifyBackup,
} from './backup.service';

export async function listBackupsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, page, limit } = req.query as Record<string, string | undefined>;
    const result = await listBackups({
      status,
      page:  page  ? parseInt(page, 10)  : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getBackupByIdHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const record = await getBackupById(req.params.id);
    res.json({ data: record });
  } catch (err) {
    next(err);
  }
}

export async function triggerBackupHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const actorId = (req as any).user?.id ?? 'unknown';
    const record = await runBackup(actorId);
    res.status(201).json({ data: record });
  } catch (err) {
    next(err);
  }
}

export async function verifyBackupHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await verifyBackup(req.params.id);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}
