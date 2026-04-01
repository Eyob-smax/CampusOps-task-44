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

const updateStatusSchema = z.object({ status: z.string().min(1) });

export async function listFulfillments(req: Request, res: Response, next: NextFunction) {
  try {
    const { studentId, status, startDate, endDate, page, limit } = req.query as any;
    res.json(await listFulfillmentRequests({ studentId, status, startDate, endDate,
      page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined }));
  } catch (err) { next(err); }
}

export async function getFulfillment(req: Request, res: Response, next: NextFunction) {
  try { res.json(await getFulfillmentById(req.params.id)); } catch (err) { next(err); }
}

export async function createFulfillmentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createFulfillmentSchema.parse(req.body);
    const actorId = (req as any).user?.id ?? 'system';
    res.status(201).json(await createFulfillmentRequest(body, actorId));
  } catch (err) { next(err); }
}

export async function updateStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = updateStatusSchema.parse(req.body);
    const actorId = (req as any).user?.id ?? 'system';
    res.json(await updateFulfillmentStatus(req.params.id, status, actorId));
  } catch (err) { next(err); }
}

export async function cancelFulfillmentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const actorId = (req as any).user?.id ?? 'system';
    res.json(await cancelFulfillment(req.params.id, actorId));
  } catch (err) { next(err); }
}
