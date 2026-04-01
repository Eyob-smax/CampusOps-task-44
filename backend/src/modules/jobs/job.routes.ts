import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { idempotency } from '../../middleware/idempotency.middleware';
import { getJobs, getJob, downloadErrorReport, retryJob } from './job.controller';

const router = Router();

router.use(authenticate);

// List + detail — admin / ops_manager only
router.get('/',          requirePermission('jobs:read'),  getJobs);
router.get('/:id',       requirePermission('jobs:read'),  getJob);
router.get('/:id/error-report', requirePermission('jobs:read'), downloadErrorReport);

// Retry — requires manage permission + idempotency key
router.post('/:id/retry', requirePermission('jobs:manage'), idempotency, retryJob);

export default router;
