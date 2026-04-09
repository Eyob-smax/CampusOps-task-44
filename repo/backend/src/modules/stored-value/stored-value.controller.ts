import { Request, Response, NextFunction } from "express";
import {
  getBalance,
  topUp,
  spend,
  listTransactions,
  generateReceiptText,
} from "./stored-value.service";
import { z } from "zod";
import { decryptAmount } from "../../lib/encryption";

const topUpSchema = z.object({
  amount: z.number().positive().max(10000),
  note: z.string().trim().max(500).optional(),
});

const spendSchema = z.object({
  amount: z.number().positive(),
  referenceId: z.string().trim().min(1).max(120),
  referenceType: z.string().trim().min(1).max(40),
});

export async function getBalanceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const balance = await getBalance(req.params.studentId, req.user);
    // Keep legacy shape while providing standardized envelope.
    res.json({ success: true, data: { balance }, balance });
  } catch (err) {
    next(err);
  }
}

export async function topUpHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const body = topUpSchema.parse(req.body);
    const actorId = (req as any).user?.id ?? "system";
    const data = await topUp(
      req.params.studentId,
      body.amount,
      actorId,
      body.note,
      req.user,
    );
    // Keep legacy shape while providing standardized envelope.
    res.status(201).json({ success: true, data, ...data });
  } catch (err) {
    next(err);
  }
}

export async function spendHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const body = spendSchema.parse(req.body);
    const actorId = (req as any).user?.id ?? "system";
    const data = await spend(
      req.params.studentId,
      body.amount,
      body.referenceId,
      body.referenceType,
      actorId,
      req.user,
    );
    // Keep legacy shape while providing standardized envelope.
    res.json({ success: true, data, ...data });
  } catch (err) {
    next(err);
  }
}

export async function listTransactionsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { page, limit, type } = req.query as any;
    const result = await listTransactions(req.params.studentId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      type,
    }, req.user);

    const items = result.items.map((item) => ({
      ...item,
      amount: decryptAmount(item.amountEncrypted),
      balanceAfter: decryptAmount(item.balanceAfterEncrypted),
    }));

    const data = {
      total: result.total,
      page: result.page,
      limit: result.limit,
      items,
    };

    // Keep legacy shape while providing standardized envelope.
    res.json({ success: true, data, ...data });
  } catch (err) {
    next(err);
  }
}

export async function getReceiptHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const text = await generateReceiptText(req.params.id, req.user);
    res.type("text/plain").send(text);
  } catch (err) {
    next(err);
  }
}
