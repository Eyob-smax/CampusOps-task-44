import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { privilegedApiSigningForScope } from '../../middleware/api-signing.middleware';
import {
  getClassroomsHandler,
  getClassroomStatsHandler,
  getClassroomHandler,
  heartbeatHandler,
} from './classroom.controller';

const router = Router();

// Heartbeat — hardware nodes POST this; protected by HMAC API signing
router.post('/heartbeat/:nodeId', privilegedApiSigningForScope('classroom'), heartbeatHandler);

// All other classroom endpoints require JWT authentication
router.use(authenticate);

// Stats — aggregated counts
router.get('/stats', requirePermission('classroom:read'), getClassroomStatsHandler);

// List classrooms
router.get('/', requirePermission('classroom:read'), getClassroomsHandler);

// Classroom detail
router.get('/:id', requirePermission('classroom:read'), getClassroomHandler);

export default router;
