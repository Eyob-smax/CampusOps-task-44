import { Router } from 'express';
import { authenticate, requirePermission, denyAuditorWrites } from '../../middleware/auth.middleware';
import {
  getDepartments, getDepartment, createDepartmentHandler,
  updateDepartmentHandler, deactivateDepartmentHandler, exportDepartmentsHandler,
} from './department.controller';

const router = Router();

router.use(authenticate);
router.use(denyAuditorWrites());

router.get('/',        requirePermission('master-data:read'), getDepartments);
router.get('/export',  requirePermission('master-data:read'), exportDepartmentsHandler);
router.get('/:id',     requirePermission('master-data:read'), getDepartment);
router.post('/',   requirePermission('master-data:write'), createDepartmentHandler);
router.put('/:id', requirePermission('master-data:write'), updateDepartmentHandler);
router.delete('/:id', requirePermission('master-data:write'), deactivateDepartmentHandler);

export default router;
