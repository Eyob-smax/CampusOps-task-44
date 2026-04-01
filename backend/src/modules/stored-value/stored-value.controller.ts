import { Request, Response, NextFunction } from 'express';
import {
  getBalance,
  topUp,
  spend,
  listTransactions,
  generateReceiptText,
} from './stored-value.service';
import { z } from 'zod';

const topUpSchema = z.object({
  amount: z.number().positive().max(10000),
  note: z.string().optional(),
});

const spendSchema = z.object({
  amount: z.number().positive(),
  referenceId: z.string().min(1),
  referenceType: z.string().min(1),
});

export async function getBalanceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const balance = await getBalance(req.params.studentId);
    res.json({ balance });
  } catch (err) { next(err); }
}

export async function topUpHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = topUpSchema.parse(req.body);
    const actorId = (req as any).user?.id ?? 'system';
    res.status(201).json(await topUp(req.params.studentId, body.amount, actorId, body.note));
  } catch (err) { next(err); }
}

export async function spendHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = spendSchema.parse(req.body);
    const actorId = (req as any).user?.id ?? 'system';
    res.json(await spend(req.params.studentId, body.amount, body.referenceId, body.referenceType, actorId));
  } catch (err) { next(err); }
}

export async function listTransactionsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, type } = req.query as any;
    res.json(await listTransactions(req.params.studentId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      type,
    }));
  } catch (err) { next(err); }
}

export async function getReceiptHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const text = await generateReceiptText(req.params.id);
    res.type('text/plain').send(text);
  } catch (err) { next(err); }
}
