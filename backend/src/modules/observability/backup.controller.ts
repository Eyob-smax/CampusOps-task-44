import { Request, Response, NextFunction } from 'express';
import {
  listBackups,
  getBackupById,
  runBackup,
  verifyBackup,
} from './backup.service';

function serializeBackupRecord<T extends { sizeBytes?: bigint | null }>(record: T): Omit<T, 'sizeBytes'> & { sizeBytes: number | null } {
  return {
    ...record,
    sizeBytes: record.sizeBytes != null ? Number(record.sizeBytes) : null,
  };
}

export async function listBackupsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, page, limit } = req.query as Record<string, string | undefined>;
    const result = await listBackups({
      status,
      page:  page  ? parseInt(page, 10)  : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    res.json({
      success: true,
      data: {
        ...result,
        items: result.items.map((item) => serializeBackupRecord(item)),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getBackupByIdHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const record = await getBackupById(req.params.id);
    res.json({ success: true, data: serializeBackupRecord(record) });
  } catch (err) {
    next(err);
  }
}

export async function triggerBackupHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const actorId = (req as any).user?.id ?? 'unknown';
    const record = await runBackup(actorId);
    res.status(201).json({ success: true, data: serializeBackupRecord(record) });
  } catch (err) {
    next(err);
  }
}

export async function verifyBackupHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await verifyBackup(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
