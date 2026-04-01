import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { idempotency } from '../../middleware/idempotency.middleware';
import {
  listBackupsHandler,
  getBackupByIdHandler,
  triggerBackupHandler,
  verifyBackupHandler,
} from './backup.controller';

const router = Router();

// All backup routes require authentication
router.use(authenticate);

// GET /backups — list backup records
router.get('/backups', requirePermission('backup:read'), listBackupsHandler);

// POST /backups — trigger a manual backup
router.post('/backups', requirePermission('backup:manage'), idempotency, triggerBackupHandler);

// GET /backups/:id — get a single backup record
router.get('/backups/:id', requirePermission('backup:read'), getBackupByIdHandler);

// POST /backups/:id/verify — verify a backup manifest
router.post('/backups/:id/verify', requirePermission('backup:manage'), idempotency, verifyBackupHandler);

export default router;
