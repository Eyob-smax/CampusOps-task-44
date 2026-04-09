import { Request, Response, NextFunction } from 'express';
import { searchAuditLogs, writeAuditEntry, getAuditLogById } from './audit.service';
import { can } from '../../lib/permissions';

export async function getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { actorId, action, entityType, entityId, from, to, page, limit } = req.query;

    // Auditors cannot reveal encrypted detail — only administrators can
    const revealDetail = can(req.user!.role, 'audit:reveal-pii') && req.query.reveal === 'true';

    const result = await searchAuditLogs(
      {
        actorId:    actorId    ? String(actorId)    : undefined,
        action:     action     ? String(action)     : undefined,
        entityType: entityType ? String(entityType) : undefined,
        entityId:   entityId   ? String(entityId)   : undefined,
        from:       from       ? new Date(String(from)) : undefined,
        to:         to         ? new Date(String(to))   : undefined,
        page:  page  ? parseInt(String(page), 10)  : 1,
        limit: limit ? parseInt(String(limit), 10) : 25,
      },
      revealDetail
    );

    res.status(200).json({ success: true, data: result.data, total: result.total });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/audit/reveal/:id — admin requests PII reveal with justification */
export async function revealAuditDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { justification } = req.body as { justification?: string };
    if (!justification || justification.trim().length < 10) {
      res.status(400).json({ success: false, error: 'Justification (min 10 chars) is required for PII reveal', code: 'VALIDATION_ERROR' });
      return;
    }

    const log = await getAuditLogById(req.params.id, true);
    if (!log) {
      res.status(404).json({ success: false, error: 'Audit log entry not found', code: 'NOT_FOUND' });
      return;
    }

    // Log the reveal action itself
    await writeAuditEntry(
      req.user!.id,
      'audit:pii-revealed',
      'audit_log',
      req.params.id,
      { justification: justification.trim(), actorRole: req.user!.role }
    );

    res.status(200).json({ success: true, data: log });
  } catch (err) {
    next(err);
  }
}
