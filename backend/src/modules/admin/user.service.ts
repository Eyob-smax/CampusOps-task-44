import bcrypt from 'bcrypt';
import { prisma } from '../../lib/prisma';
import { writeAuditEntry } from './audit.service';
import type { UserRole } from '../../types';
import { z } from 'zod';

const BCRYPT_ROUNDS = 12;

export const createUserSchema = z.object({
  username: z.string().min(3).max(80).trim().regex(/^[a-zA-Z0-9_.-]+$/, 'Username may only contain letters, digits, _, ., -'),
  password: z
    .string()
    .min(12)
    .max(200)
    .regex(/[A-Z]/, 'Must have uppercase')
    .regex(/[a-z]/, 'Must have lowercase')
    .regex(/[0-9]/, 'Must have digit')
    .regex(/[^A-Za-z0-9]/, 'Must have special character'),
  role: z.enum(['administrator', 'operations_manager', 'classroom_supervisor', 'customer_service_agent', 'auditor']),
});

export const updateUserSchema = z.object({
  username: z.string().min(3).max(80).trim().optional(),
  isActive: z.boolean().optional(),
});

export const changeRoleSchema = z.object({
  role: z.enum(['administrator', 'operations_manager', 'classroom_supervisor', 'customer_service_agent', 'auditor']),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;

export async function listUsers() {
  return prisma.user.findMany({
    select: { id: true, username: true, role: true, isActive: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, role: true, isActive: true, createdAt: true, updatedAt: true },
  });
}

export async function createUser(dto: CreateUserDto, actorId: string) {
  const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: { username: dto.username, passwordHash, role: dto.role },
    select: { id: true, username: true, role: true, isActive: true, createdAt: true },
  });

  await writeAuditEntry(actorId, 'user:created', 'user', user.id, {
    username: dto.username,
    role: dto.role,
  });

  return user;
}

export async function updateUser(id: string, dto: UpdateUserDto, actorId: string) {
  const user = await prisma.user.update({
    where: { id },
    data: dto,
    select: { id: true, username: true, role: true, isActive: true, updatedAt: true },
  });

  await writeAuditEntry(actorId, 'user:updated', 'user', id, { changes: dto });
  return user;
}

export async function changeUserRole(id: string, role: UserRole, actorId: string) {
  const prev = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  const user = await prisma.user.update({
    where: { id },
    data: { role },
    select: { id: true, username: true, role: true },
  });

  await writeAuditEntry(actorId, 'user:role-changed', 'user', id, {
    previousRole: prev?.role,
    newRole: role,
  });

  return user;
}

export async function resetUserPassword(id: string, newPassword: string, actorId: string) {
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
  await writeAuditEntry(actorId, 'user:password-reset', 'user', id, { resetBy: actorId });
}

export async function deactivateUser(id: string, actorId: string) {
  if (id === actorId) {
    throw Object.assign(new Error('Cannot deactivate your own account'), { statusCode: 400, code: 'SELF_DEACTIVATE' });
  }
  await prisma.user.update({ where: { id }, data: { isActive: false } });
  await writeAuditEntry(actorId, 'user:deactivated', 'user', id, {});
}
