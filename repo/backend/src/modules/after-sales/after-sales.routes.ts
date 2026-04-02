import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { idempotency } from '../../middleware/idempotency.middleware';
import {
  listTicketsHandler,
  getTicketHandler,
  createTicketHandler,
  updateTicketStatusHandler,
} from './after-sales.controller';
import {
  uploadEvidenceHandler,
  addTextNoteHandler,
  multerSingleImage,
} from './evidence.controller';
import {
  getCompensationsHandler,
  suggestCompensationHandler,
  approveCompensationHandler,
  rejectCompensationHandler,
} from './compensation.controller';

const router = Router();

// ---- Ticket CRUD ----

router.get(
  '/',
  authenticate,
  requirePermission('after-sales:read'),
  listTicketsHandler,
);

router.post(
  '/',
  authenticate,
  requirePermission('after-sales:create'),
  idempotency,
  createTicketHandler,
);

router.get(
  '/:id',
  authenticate,
  requirePermission('after-sales:read'),
  getTicketHandler,
);

router.patch(
  '/:id/status',
  authenticate,
  requirePermission('after-sales:manage'),
  idempotency,
  updateTicketStatusHandler,
);

// ---- Evidence ----

router.post(
  '/:id/evidence/image',
  authenticate,
  requirePermission('files:upload'),
  multerSingleImage,
  uploadEvidenceHandler,
);

router.post(
  '/:id/evidence/text',
  authenticate,
  requirePermission('files:upload'),
  addTextNoteHandler,
);

// ---- Compensations ----

router.get(
  '/:id/compensations',
  authenticate,
  requirePermission('after-sales:read'),
  getCompensationsHandler,
);

router.post(
  '/:id/compensations/suggest',
  authenticate,
  requirePermission('compensation:suggest'),
  suggestCompensationHandler,
);

router.patch(
  '/:id/compensations/:cid/approve',
  authenticate,
  requirePermission('compensation:approve-limited'),
  approveCompensationHandler,
);

router.patch(
  '/:id/compensations/:cid/reject',
  authenticate,
  requirePermission('compensation:approve-limited'),
  rejectCompensationHandler,
);

export default router;
