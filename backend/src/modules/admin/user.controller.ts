import { Request, Response, NextFunction } from 'express';
import {
  listUsers, getUserById, createUser, updateUser,
  changeUserRole, resetUserPassword, deactivateUser,
  createUserSchema, updateUserSchema, changeRoleSchema,
} from './user.service';
import { z } from 'zod';

const resetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(12)
    .max(200)
    .regex(/[A-Z]/)
    .regex(/[a-z]/)
    .regex(/[0-9]/)
    .regex(/[^A-Za-z0-9]/),
});

export async function getUsers(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const users = await listUsers();
    res.status(200).json({ success: true, data: users });
  } catch (err) { next(err); }
}

export async function getUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await getUserById(req.params.id);
    if (!user) { res.status(404).json({ success: false, error: 'User not found', code: 'NOT_FOUND' }); return; }
    res.status(200).json({ success: true, data: user });
  } catch (err) { next(err); }
}

export async function createUserHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = createUserSchema.parse(req.body);
    const user = await createUser(dto, req.user!.id);
    res.status(201).json({ success: true, data: user });
  } catch (err) { next(err); }
}

export async function updateUserHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = updateUserSchema.parse(req.body);
    const user = await updateUser(req.params.id, dto, req.user!.id);
    res.status(200).json({ success: true, data: user });
  } catch (err) { next(err); }
}

export async function changeRoleHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { role } = changeRoleSchema.parse(req.body);
    const user = await changeUserRole(req.params.id, role, req.user!.id);
    res.status(200).json({ success: true, data: user });
  } catch (err) { next(err); }
}

export async function resetPasswordHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { newPassword } = resetPasswordSchema.parse(req.body);
    await resetUserPassword(req.params.id, newPassword, req.user!.id);
    res.status(200).json({ success: true, message: 'Password reset successfully' });
  } catch (err) { next(err); }
}

export async function deactivateUserHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deactivateUser(req.params.id, req.user!.id);
    res.status(200).json({ success: true, message: 'User deactivated' });
  } catch (err) { next(err); }
}
