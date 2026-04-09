import { Router } from 'express';
import { authenticate, requirePermission, denyAuditorWrites } from '../../middleware/auth.middleware';
import {
  getSemesters, getSemester, createSemesterHandler, updateSemesterHandler, exportSemestersHandler,
} from './semester.controller';
import {
  uploadMasterDataImportFile,
  importSemestersHandler,
} from './master-import.controller';
import { idempotency } from '../../middleware/idempotency.middleware';

const router = Router();

router.use(authenticate);
router.use(denyAuditorWrites());

router.get('/',        requirePermission('master-data:read'), getSemesters);
router.get('/export',  requirePermission('master-data:read'), exportSemestersHandler);
router.post('/import', requirePermission('master-data:write'), idempotency, uploadMasterDataImportFile, importSemestersHandler);
router.get('/:id',     requirePermission('master-data:read'), getSemester);
router.post('/',   requirePermission('master-data:write'), idempotency, createSemesterHandler);
router.put('/:id', requirePermission('master-data:write'), idempotency, updateSemesterHandler);

export default router;
