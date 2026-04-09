import { Request, Response, NextFunction } from 'express';
import {
  listTickets,
  getTicketById,
  createTicket,
  updateTicketStatus,
  computeSlaStatus,
  createTicketSchema,
  updateTicketStatusSchema,
} from './after-sales.service';
import { serializeStudentInRecord, serializeStudentInRecords } from '../../lib/student-serialization';

export async function listTicketsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { studentId, type, status, page, limit } = req.query as any;
    const result = await listTickets({
      studentId,
      type,
      status,
      page:  page  ? Number(page)  : undefined,
      limit: limit ? Number(limit) : undefined,
    }, req.user);

    // Append SLA status to each ticket
    const items = serializeStudentInRecords(
      result.items.map((t) => ({
        ...t,
        slaStatus: computeSlaStatus(t),
      })) as Array<Record<string, unknown>>,
      req.user?.role,
    );

    res.json({ success: true, data: { ...result, items } });
  } catch (err) {
    next(err);
  }
}

export async function getTicketHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const ticket = await getTicketById(req.params.id, req.user);
    const payload = serializeStudentInRecord(
      { ...ticket, slaStatus: computeSlaStatus(ticket) } as Record<string, unknown>,
      req.user?.role,
    );
    res.json({
      success: true,
      data: payload,
    });
  } catch (err) {
    next(err);
  }
}

export async function createTicketHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body    = createTicketSchema.parse(req.body);
    const actorId = (req as any).user?.id ?? 'system';
    const ticket = await createTicket(body, actorId, req.user);
    res.status(201).json({
      success: true,
      data: serializeStudentInRecord(ticket as Record<string, unknown>, req.user?.role),
    });
  } catch (err) {
    next(err);
  }
}

export async function updateTicketStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, note } = updateTicketStatusSchema.parse(req.body);
    const actorId          = (req as any).user?.id ?? 'system';
    const ticket = await updateTicketStatus(
      req.params.id,
      status,
      actorId,
      req.user,
      note,
    );
    res.json({
      success: true,
      data: serializeStudentInRecord(ticket as Record<string, unknown>, req.user?.role),
    });
  } catch (err) {
    next(err);
  }
}
