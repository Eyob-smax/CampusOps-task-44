import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { getAuditLogs, revealAuditDetail } from './audit.controller';

const router = Router();

router.use(authenticate);

// GET /api/admin/audit — search audit logs (admins + auditors)
router.get('/', requirePermission('audit:read'), getAuditLogs);

// POST /api/admin/audit/reveal/:id — reveal encrypted PII detail (admin only)
router.post('/reveal/:id', requirePermission('audit:reveal-pii'), revealAuditDetail);

export default router;
