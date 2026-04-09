import { Router } from 'express';
import { liveness, readiness, serviceInfo } from './health.controller';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';

const router = Router();

router.get('/',      liveness);   // GET /health
router.get('/ready', readiness);  // GET /health/ready
router.get('/info',  authenticate, requirePermission('metrics:read'), serviceInfo); // GET /health/info

export default router;
