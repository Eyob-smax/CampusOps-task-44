import { Request, Response, NextFunction } from 'express';
import {
  listFulfillmentRequests,
  getFulfillmentById,
  createFulfillmentRequest,
  updateFulfillmentStatus,
  cancelFulfillment,
  createFulfillmentSchema,
} from './fulfillment.service';
import { z } from 'zod';
import { serializeStudentInRecord, serializeStudentInRecords } from '../../lib/student-serialization';

const updateStatusSchema = z.object({ status: z.string().min(1) });

export async function listFulfillments(req: Request, res: Response, next: NextFunction) {
  try {
    const { studentId, status, startDate, endDate, page, limit } = req.query as any;
    const data = await listFulfillmentRequests({
      studentId,
      status,
      startDate,
      endDate,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    }, req.user);
    res.json({
      success: true,
      data: {
        ...data,
        items: serializeStudentInRecords(data.items as Array<Record<string, unknown>>, req.user?.role),
      },
    });
  } catch (err) { next(err); }
}

export async function getFulfillment(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getFulfillmentById(req.params.id, req.user);
    res.json({
      success: true,
      data: serializeStudentInRecord(data as Record<string, unknown>, req.user?.role),
    });
  } catch (err) { next(err); }
}

export async function createFulfillmentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createFulfillmentSchema.parse(req.body);
    const actorId = (req as any).user?.id ?? 'system';
    const data = await createFulfillmentRequest(body, actorId, req.user);
    res.status(201).json({
      success: true,
      data: serializeStudentInRecord(data as Record<string, unknown>, req.user?.role),
    });
  } catch (err) { next(err); }
}

export async function updateStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = updateStatusSchema.parse(req.body);
    const actorId = (req as any).user?.id ?? 'system';
    const data = await updateFulfillmentStatus(req.params.id, status, actorId, req.user);
    res.json({
      success: true,
      data: serializeStudentInRecord(data as Record<string, unknown>, req.user?.role),
    });
  } catch (err) { next(err); }
}

export async function cancelFulfillmentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const actorId = (req as any).user?.id ?? 'system';
    const data = await cancelFulfillment(req.params.id, actorId, req.user);
    res.json({
      success: true,
      data: serializeStudentInRecord(data as Record<string, unknown>, req.user?.role),
    });
  } catch (err) { next(err); }
}
