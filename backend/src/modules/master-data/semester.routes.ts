import { Router } from 'express';
import { authenticate, requirePermission, denyAuditorWrites } from '../../middleware/auth.middleware';
import {
  getSemesters, getSemester, createSemesterHandler, updateSemesterHandler, exportSemestersHandler,
} from './semester.controller';

const router = Router();

router.use(authenticate);
router.use(denyAuditorWrites());

router.get('/',        requirePermission('master-data:read'), getSemesters);
router.get('/export',  requirePermission('master-data:read'), exportSemestersHandler);
router.get('/:id',     requirePermission('master-data:read'), getSemester);
router.post('/',   requirePermission('master-data:write'), createSemesterHandler);
router.put('/:id', requirePermission('master-data:write'), updateSemesterHandler);

export default router;
