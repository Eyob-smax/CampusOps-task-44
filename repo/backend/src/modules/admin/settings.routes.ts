import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { getSettings, patchSettings, getThresholds, upsertThreshold, getBackups } from './settings.controller';
import { getKeys, createKey, rotateKey, deactivateKey } from './integration-key.controller';

const router = Router();

router.use(authenticate);

// System settings
router.get('/',            requirePermission('settings:read'),   getSettings);
router.patch('/',          requirePermission('settings:update'),  patchSettings);

// Alert thresholds
router.get('/thresholds',  requirePermission('alerts:manage'),    getThresholds);
router.put('/thresholds',  requirePermission('alerts:manage'),    upsertThreshold);

// Backup records (read-only view)
router.get('/backups',     requirePermission('backup:read'),      getBackups);

// Integration keys
router.get('/keys',        requirePermission('integration-keys:manage'), getKeys);
router.post('/keys',       requirePermission('integration-keys:manage'), createKey);
router.post('/keys/:id/rotate',     requirePermission('integration-keys:manage'), rotateKey);
router.delete('/keys/:id',          requirePermission('integration-keys:manage'), deactivateKey);

export default router;
