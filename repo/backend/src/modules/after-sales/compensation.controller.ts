import { Request, Response, NextFunction } from 'express';
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
  const role = (req as any).user?.role as Parameters<typeof can>[0] | undefined;
  if (!role) return 'limited';
  if (can(role, 'compensation:approve-override')) return 'override';
  if (can(role, 'compensation:approve-full')) return 'full';
  return 'limited';
}

// ---- Handlers ----

export async function getCompensationsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await getTicketCompensations(req.params.id, req.user);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function suggestCompensationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const actorId = (req as any).user?.id ?? 'system';
    const result  = await suggestCompensation(req.params.id, actorId, req.user);
    if (!result) {
      res.json({
        success: true,
        data: null,
        message: 'No compensation suggested (cap reached or no matching rule)',
      });
      return;
    }
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function approveCompensationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const actorId         = (req as any).user?.id ?? 'system';
    const permissionLevel = resolvePermissionLevel(req);
    const { note }        = approveCompensationSchema.parse(req.body);
    const result          = await approveCompensation(req.params.id, req.params.cid, actorId, permissionLevel, req.user, note);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function rejectCompensationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const actorId  = (req as any).user?.id ?? 'system';
    const { note } = approveCompensationSchema.parse(req.body);
    const result   = await rejectCompensation(req.params.id, req.params.cid, actorId, req.user, note);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function listRulesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const rules = await getActiveRules();
    res.json({ success: true, data: rules });
  } catch (err) {
    next(err);
  }
}

export async function createRuleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body    = createCompensationRuleSchema.parse(req.body);
    const actorId = (req as any).user?.id ?? 'system';
    const rule = await createCompensationRule(body, actorId);
    res.status(201).json({ success: true, data: rule });
  } catch (err) {
    next(err);
  }
}

export async function updateRuleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body    = createCompensationRuleSchema.partial().parse(req.body);
    const actorId = (req as any).user?.id ?? 'system';
    const rule = await updateCompensationRule(req.params.ruleId, body, actorId);
    res.json({ success: true, data: rule });
  } catch (err) {
    next(err);
  }
}
