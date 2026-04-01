import { Router } from 'express';
import { authenticate, requirePermission, denyAuditorWrites } from '../../middleware/auth.middleware';
import {
  getCourses, getCourse, createCourseHandler, updateCourseHandler, exportCoursesHandler,
} from './course.controller';

const router = Router();

router.use(authenticate);
router.use(denyAuditorWrites());

router.get('/',        requirePermission('master-data:read'), getCourses);
router.get('/export',  requirePermission('master-data:read'), exportCoursesHandler);
router.get('/:id',     requirePermission('master-data:read'), getCourse);
router.post('/',   requirePermission('master-data:write'), createCourseHandler);
router.put('/:id', requirePermission('master-data:write'), updateCourseHandler);

export default router;
