import { prisma } from '../../lib/prisma';
import { writeAuditEntry } from '../admin/audit.service';
import { z } from 'zod';

export const createClassSchema = z.object({
  name: z.string().min(2).max(200).trim(),
  courseId: z.string().uuid(),
  departmentId: z.string().uuid(),
  semesterId: z.string().uuid(),
  roomNumber: z.string().max(20).trim().optional(),
  isActive: z.boolean().optional().default(true),
});

export const updateClassSchema = z.object({
  name: z.string().min(2).max(200).trim().optional(),
  courseId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  semesterId: z.string().uuid().optional(),
  roomNumber: z.string().max(20).trim().nullable().optional(),
  isActive: z.boolean().optional(),
});

export type CreateClassDto = z.infer<typeof createClassSchema>;
export type UpdateClassDto = z.infer<typeof updateClassSchema>;

export async function listClasses(filters?: { semesterId?: string; departmentId?: string; activeOnly?: boolean }) {
  return prisma.class.findMany({
    where: {
      ...(filters?.semesterId   && { semesterId: filters.semesterId }),
      ...(filters?.departmentId && { departmentId: filters.departmentId }),
      ...(filters?.activeOnly   && { isActive: true }),
    },
    include: {
      course:     { select: { code: true, name: true } },
      department: { select: { name: true, code: true } },
      semester:   { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  });
}

export async function getClassById(id: string) {
  return prisma.class.findUnique({
    where: { id },
    include: {
      course:     { select: { code: true, name: true } },
      department: { select: { name: true, code: true } },
      semester:   { select: { name: true } },
    },
  });
}

export async function createClass(dto: CreateClassDto, actorId: string) {
  const cls = await prisma.class.create({ data: dto });
  await writeAuditEntry(actorId, 'class:created', 'class', cls.id, { name: dto.name });
  return cls;
}

export async function updateClass(id: string, dto: UpdateClassDto, actorId: string) {
  const cls = await prisma.class.update({ where: { id }, data: dto });
  await writeAuditEntry(actorId, 'class:updated', 'class', id, { changes: dto });
  return cls;
}

export async function exportClassesCsv(): Promise<string> {
  const rows = await prisma.class.findMany({
    include: {
      course:     { select: { code: true, name: true } },
      department: { select: { code: true } },
      semester:   { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  });
  const header = 'name,courseCode,courseName,departmentCode,semesterName,roomNumber,isActive,createdAt';
  const lines = rows.map(r => [
    csvEscape(r.name),
    csvEscape(r.course.code),
    csvEscape(r.course.name),
    csvEscape(r.department.code),
    csvEscape(r.semester.name),
    csvEscape(r.roomNumber ?? ''),
    r.isActive,
    r.createdAt.toISOString(),
  ].join(','));
  return [header, ...lines].join('\r\n');
}

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
