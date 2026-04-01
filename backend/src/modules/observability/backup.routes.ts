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

// GET /backups — list backup records
router.get('/backups', authenticate, requirePermission('backup:read'), listBackupsHandler);

// POST /backups — trigger a manual backup
router.post('/backups', authenticate, requirePermission('backup:manage'), idempotency, triggerBackupHandler);

// GET /backups/:id — get a single backup record
router.get('/backups/:id', authenticate, requirePermission('backup:read'), getBackupByIdHandler);

// POST /backups/:id/verify — verify a backup manifest
router.post('/backups/:id/verify', authenticate, requirePermission('backup:manage'), idempotency, verifyBackupHandler);

export default router;
