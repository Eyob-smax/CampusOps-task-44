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

export async function listTicketsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { studentId, type, status, page, limit } = req.query as any;
    const result = await listTickets({
      studentId,
      type,
      status,
      page:  page  ? Number(page)  : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    // Append SLA status to each ticket
    const items = result.items.map(t => ({
      ...t,
      slaStatus: computeSlaStatus(t),
    }));

    res.json({ ...result, items });
  } catch (err) {
    next(err);
  }
}

export async function getTicketHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const ticket = await getTicketById(req.params.id);
    res.json({ ...ticket, slaStatus: computeSlaStatus(ticket) });
  } catch (err) {
    next(err);
  }
}

export async function createTicketHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body    = createTicketSchema.parse(req.body);
    const actorId = (req as any).user?.id ?? 'system';
    res.status(201).json(await createTicket(body, actorId));
  } catch (err) {
    next(err);
  }
}

export async function updateTicketStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, note } = updateTicketStatusSchema.parse(req.body);
    const actorId          = (req as any).user?.id ?? 'system';
    res.json(await updateTicketStatus(req.params.id, status, actorId, note));
  } catch (err) {
    next(err);
  }
}
