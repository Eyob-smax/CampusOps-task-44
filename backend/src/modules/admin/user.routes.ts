import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import {
  getUsers, getUser, createUserHandler, updateUserHandler,
  changeRoleHandler, resetPasswordHandler, deactivateUserHandler,
} from './user.controller';
import { idempotency } from '../../middleware/idempotency.middleware';

const router = Router();

router.use(authenticate, requirePermission('users:read'));

router.get('/',              getUsers);
router.get('/:id',           getUser);
router.post('/',             requirePermission('users:create'), idempotency, createUserHandler);
router.patch('/:id',         requirePermission('users:update'), updateUserHandler);
router.patch('/:id/role',    requirePermission('users:change-role'), changeRoleHandler);
router.post('/:id/reset-password', requirePermission('users:update'), resetPasswordHandler);
router.delete('/:id',        requirePermission('users:delete'), deactivateUserHandler);

export default router;
