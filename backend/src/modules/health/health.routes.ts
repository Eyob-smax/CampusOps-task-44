import { Router } from 'express';
import { liveness, readiness, serviceInfo } from './health.controller';

const router = Router();

router.get('/',      liveness);   // GET /health
router.get('/ready', readiness);  // GET /health/ready
router.get('/info',  serviceInfo); // GET /health/info

export default router;
