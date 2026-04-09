import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { privilegedApiSigningForScope } from '../../middleware/api-signing.middleware';
import { idempotency } from '../../middleware/idempotency.middleware';
import {
  getLotsHandler,
  getLotStatsHandler,
  getDashboardHandler,
  recordEntryHandler,
  recordExitHandler,
  getSessionsHandler,
} from './parking.controller';

const router = Router();

// Hardware ingest routes — protected by HMAC API signing (no JWT needed)
router.post('/sessions/entry', privilegedApiSigningForScope('parking'), idempotency, recordEntryHandler);
router.post('/sessions/exit',  privilegedApiSigningForScope('parking'), idempotency, recordExitHandler);

// All other parking endpoints require JWT authentication
router.use(authenticate);

router.get('/dashboard',       requirePermission('parking:read'),   getDashboardHandler);
router.get('/lots',            requirePermission('parking:read'),   getLotsHandler);
router.get('/lots/:id/stats',  requirePermission('parking:read'),   getLotStatsHandler);
router.get('/sessions',        requirePermission('parking:read'),   getSessionsHandler);

export default router;
