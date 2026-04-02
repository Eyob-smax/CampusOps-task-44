import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { can } from '../../lib/permissions';
import {
  getTicketCompensations,
  suggestCompensation,
  approveCompensation,
  rejectCompensation,
  createCompensationRule,
  updateCompensationRule,
  getActiveRules,
  createCompensationRuleSchema,
  approveCompensationSchema,
} from './compensation.service';

// ---- Helpers ----

function resolvePermissionLevel(
  req: Request,
): 'limited' | 'full' | 'override' {
  const role = (req as any).user?.role as string | undefined;
  if (role === 'administrator') return 'override';
  if (role === 'operations_manager') return 'full';
  return 'limited';
}

// ---- Handlers ----

export async function getCompensationsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await getTicketCompensations(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function suggestCompensationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const actorId = (req as any).user?.id ?? 'system';
    const result  = await suggestCompensation(req.params.id, actorId);
    if (!result) {
      res.json({ message: 'No compensation suggested (cap reached or no matching rule)' });
      return;
    }
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function approveCompensationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const actorId         = (req as any).user?.id ?? 'system';
    const permissionLevel = resolvePermissionLevel(req);
    const { note }        = approveCompensationSchema.parse(req.body);
    const result          = await approveCompensation(req.params.cid, actorId, permissionLevel, note);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function rejectCompensationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const actorId  = (req as any).user?.id ?? 'system';
    const { note } = approveCompensationSchema.parse(req.body);
    const result   = await rejectCompensation(req.params.cid, actorId, note);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function listRulesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await getActiveRules());
  } catch (err) {
    next(err);
  }
}

export async function createRuleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body    = createCompensationRuleSchema.parse(req.body);
    const actorId = (req as any).user?.id ?? 'system';
    res.status(201).json(await createCompensationRule(body, actorId));
  } catch (err) {
    next(err);
  }
}

export async function updateRuleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body    = createCompensationRuleSchema.partial().parse(req.body);
    const actorId = (req as any).user?.id ?? 'system';
    res.json(await updateCompensationRule(req.params.ruleId, body, actorId));
  } catch (err) {
    next(err);
  }
}
