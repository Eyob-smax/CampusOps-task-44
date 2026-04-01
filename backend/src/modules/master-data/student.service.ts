import { prisma } from '../../lib/prisma';
import { writeAuditEntry } from '../admin/audit.service';
import { decrypt, encrypt } from '../../lib/encryption';
import { maskStudent } from '../../lib/masking';
import type { UserRole, PaginatedResult } from '../../types';
import { z } from 'zod';

export const createStudentSchema = z.object({
  studentNumber: z.string().min(1).max(30).trim(),
  fullName:      z.string().min(2).max(200).trim(),
  email:         z.string().email().toLowerCase(),
  phone:         z.string().max(20).trim().optional(),
  departmentId:  z.string().uuid().optional(),
  membershipTierId: z.string().uuid().optional(),
  isActive:      z.boolean().optional().default(true),
});

export const updateStudentSchema = z.object({
  fullName:         z.string().min(2).max(200).trim().optional(),
  email:            z.string().email().toLowerCase().optional(),
  phone:            z.string().max(20).trim().nullable().optional(),
  departmentId:     z.string().uuid().nullable().optional(),
  membershipTierId: z.string().uuid().nullable().optional(),
  isActive:         z.boolean().optional(),
});

export type CreateStudentDto = z.infer<typeof createStudentSchema>;
export type UpdateStudentDto = z.infer<typeof updateStudentSchema>;

// Fields visible to all roles (masking applied separately)
const STUDENT_SELECT = {
  id: true, studentNumber: true, fullName: true, email: true, phone: true,
  departmentId: true, membershipTierId: true, growthPoints: true,
  storedValueEncrypted: true, isActive: true, createdAt: true, updatedAt: true,
  membershipTier: { select: { name: true, tier: true } },
};

export function serializeStudent(raw: RawStudent, callerRole: UserRole) {
  const masked = maskStudent(
    { fullName: raw.fullName, studentId: raw.studentNumber, email: raw.email, phone: raw.phone ?? '' },
    callerRole,
  );

  const showStoredValue = callerRole === 'administrator' || callerRole === 'operations_manager';
  let storedValueBalance: number | null = null;
  if (showStoredValue && raw.storedValueEncrypted) {
    try {
      storedValueBalance = parseFloat(decrypt(raw.storedValueEncrypted));
    } catch {
      storedValueBalance = null;
    }
  }

  return {
    id:               raw.id,
    studentNumber:    masked.studentId,
    fullName:         masked.fullName,
    email:            masked.email,
    phone:            masked.phone ?? null,
    departmentId:     raw.departmentId,
    membershipTierId: raw.membershipTierId,
    membershipTier:   raw.membershipTier,
    growthPoints:     raw.growthPoints,
    storedValueBalance: showStoredValue ? storedValueBalance : undefined,
    isActive:         raw.isActive,
    createdAt:        raw.createdAt,
    updatedAt:        raw.updatedAt,
  };
}

interface RawStudent {
  id: string;
  studentNumber: string;
  fullName: string;
  email: string;
  phone: string | null;
  departmentId: string | null;
  membershipTierId: string | null;
  membershipTier: { name: string; tier: string } | null;
  growthPoints: number;
  storedValueEncrypted: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export async function listStudents(
  params: { search?: string; departmentId?: string; isActive?: boolean; page?: number; limit?: number },
  callerRole: UserRole,
): Promise<PaginatedResult<ReturnType<typeof serializeStudent>>> {
  const page  = Math.max(1, params.page  ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 25));
  const skip  = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (params.isActive !== undefined) where['isActive'] = params.isActive;
  if (params.departmentId) where['departmentId'] = params.departmentId;
  if (params.search) {
    where['OR'] = [
      { fullName:      { contains: params.search } },
      { studentNumber: { contains: params.search } },
      { email:         { contains: params.search } },
    ];
  }

  const [rows, total] = await prisma.$transaction([
    prisma.student.findMany({ where, select: STUDENT_SELECT, orderBy: { studentNumber: 'asc' }, skip, take: limit }),
    prisma.student.count({ where }),
  ]);

  return {
    data: rows.map(r => serializeStudent(r as RawStudent, callerRole)),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getStudentById(id: string, callerRole: UserRole) {
  const raw = await prisma.student.findUnique({ where: { id }, select: STUDENT_SELECT });
  if (!raw) return null;
  return serializeStudent(raw as RawStudent, callerRole);
}

export async function createStudent(dto: CreateStudentDto, actorId: string, callerRole: UserRole) {
  const student = await prisma.student.create({
    data: {
      studentNumber:    dto.studentNumber,
      fullName:         dto.fullName,
      email:            dto.email,
      phone:            dto.phone,
      departmentId:     dto.departmentId,
      membershipTierId: dto.membershipTierId,
      isActive:         dto.isActive ?? true,
    },
    select: STUDENT_SELECT,
  });
  await writeAuditEntry(actorId, 'student:created', 'student', student.id, { studentNumber: dto.studentNumber });
  return serializeStudent(student as RawStudent, callerRole);
}

export async function updateStudent(id: string, dto: UpdateStudentDto, actorId: string, callerRole: UserRole) {
  const student = await prisma.student.update({
    where: { id },
    data: dto,
    select: STUDENT_SELECT,
  });
  await writeAuditEntry(actorId, 'student:updated', 'student', id, { changes: dto });
  return serializeStudent(student as RawStudent, callerRole);
}

export async function deactivateStudent(id: string, actorId: string) {
  await prisma.student.update({ where: { id }, data: { isActive: false } });
  await writeAuditEntry(actorId, 'student:deactivated', 'student', id, {});
}

export async function exportStudentsCsv(callerRole: UserRole): Promise<string> {
  const rows = await prisma.student.findMany({ select: STUDENT_SELECT, orderBy: { studentNumber: 'asc' } });
  const header = 'studentNumber,fullName,email,phone,departmentId,membershipTierId,growthPoints,isActive,createdAt';
  const lines = rows.map(r => {
    const s = serializeStudent(r as RawStudent, callerRole);
    return [
      csvEscape(s.studentNumber ?? ''),
      csvEscape(s.fullName ?? ''),
      csvEscape(s.email ?? ''),
      csvEscape(s.phone ?? ''),
      csvEscape(s.departmentId ?? ''),
      csvEscape(s.membershipTierId ?? ''),
      s.growthPoints,
      s.isActive,
      s.createdAt.toISOString(),
    ].join(',');
  });
  return [header, ...lines].join('\r\n');
}

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

// Used by import service — upsert by studentNumber
export async function upsertStudentRaw(data: {
  studentNumber: string;
  fullName: string;
  email: string;
  phone?: string;
  departmentId?: string;
  membershipTierId?: string;
}) {
  return prisma.student.upsert({
    where: { studentNumber: data.studentNumber },
    create: {
      studentNumber:    data.studentNumber,
      fullName:         data.fullName,
      email:            data.email,
      phone:            data.phone,
      departmentId:     data.departmentId,
      membershipTierId: data.membershipTierId,
    },
    update: {
      fullName:         data.fullName,
      email:            data.email,
      phone:            data.phone,
      departmentId:     data.departmentId,
      membershipTierId: data.membershipTierId,
    },
    select: { id: true, studentNumber: true },
  });
}
