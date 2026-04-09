import { Request, Response, NextFunction } from 'express';
import {
  listClassrooms,
  getClassroomById,
  getClassroomStats,
  processHeartbeat,
  heartbeatSchema,
} from './classroom.service';

export async function getClassroomsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await listClassrooms({
      departmentId: req.query.departmentId as string | undefined,
      status:       req.query.status as string | undefined as Parameters<typeof listClassrooms>[0]['status'],
      search:       req.query.search as string | undefined,
      activeOnly:   req.query.active !== 'false',
      page:         req.query.page  ? parseInt(req.query.page as string, 10)  : 1,
      limit:        req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
    }, req.user);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getClassroomStatsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await getClassroomStats(req.user);
    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}

export async function getClassroomHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const classroom = await getClassroomById(req.params.id, req.user);
    if (!classroom) {
      res.status(404).json({ success: false, error: 'Classroom not found', code: 'NOT_FOUND' });
      return;
    }
    res.json({ success: true, data: classroom });
  } catch (err) {
    next(err);
  }
}

export async function heartbeatHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = heartbeatSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Invalid heartbeat payload', code: 'VALIDATION_ERROR', details: parsed.error.errors });
      return;
    }
    const result = await processHeartbeat(req.params.nodeId, parsed.data);
    if (!result) {
      res.status(404).json({ success: false, error: 'Hardware node not found or inactive', code: 'NOT_FOUND' });
      return;
    }
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
