import { Router } from 'express';
import { authenticate, requirePermission, denyAuditorWrites } from '../../middleware/auth.middleware';
import { idempotency } from '../../middleware/idempotency.middleware';
import {
  getStudents, getStudent, createStudentHandler, updateStudentHandler,
  deactivateStudentHandler, importStudentsHandler, exportStudentsHandler,
  uploadMiddleware,
} from './student.controller';

const router = Router();

router.use(authenticate);

// Read — all authenticated roles (PII masking applied per role in service)
router.get('/',        requirePermission('master-data:read'), getStudents);
router.get('/export',  requirePermission('master-data:read'), exportStudentsHandler);
router.get('/:id',     requirePermission('master-data:read'), getStudent);

// Write — blocked for auditor
router.use(denyAuditorWrites());

router.post(
  '/',
  requirePermission('students:write'),
  idempotency,
  createStudentHandler,
);

router.put('/:id',     requirePermission('students:write'), updateStudentHandler);
router.delete('/:id',  requirePermission('students:write'), deactivateStudentHandler);

// Bulk import — multipart; idempotency key optional but honoured
router.post('/import', requirePermission('students:write'), uploadMiddleware, importStudentsHandler);

export default router;
