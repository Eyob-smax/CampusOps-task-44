import { prisma } from '../../lib/prisma';
import { writeAuditEntry } from '../admin/audit.service';
import { z } from 'zod';

export const createCourseSchema = z.object({
  code: z.string().min(1).max(20).trim().toUpperCase(),
  name: z.string().min(2).max(200).trim(),
  departmentId: z.string().uuid(),
  isActive: z.boolean().optional().default(true),
});

export const updateCourseSchema = z.object({
  code: z.string().min(1).max(20).trim().toUpperCase().optional(),
  name: z.string().min(2).max(200).trim().optional(),
  departmentId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
});

export type CreateCourseDto = z.infer<typeof createCourseSchema>;
export type UpdateCourseDto = z.infer<typeof updateCourseSchema>;

export async function listCourses(departmentId?: string, activeOnly = false) {
  return prisma.course.findMany({
    where: {
      ...(departmentId && { departmentId }),
      ...(activeOnly   && { isActive: true }),
    },
    include: { department: { select: { name: true, code: true } } },
    orderBy: { code: 'asc' },
  });
}

export async function getCourseById(id: string) {
  return prisma.course.findUnique({
    where: { id },
    include: { department: { select: { name: true, code: true } } },
  });
}

export async function createCourse(dto: CreateCourseDto, actorId: string) {
  const course = await prisma.course.create({ data: dto });
  await writeAuditEntry(actorId, 'course:created', 'course', course.id, { code: dto.code, name: dto.name });
  return course;
}

export async function updateCourse(id: string, dto: UpdateCourseDto, actorId: string) {
  const course = await prisma.course.update({ where: { id }, data: dto });
  await writeAuditEntry(actorId, 'course:updated', 'course', id, { changes: dto });
  return course;
}

export async function exportCoursesCsv(): Promise<string> {
  const rows = await prisma.course.findMany({
    include: { department: { select: { code: true, name: true } } },
    orderBy: { code: 'asc' },
  });
  const header = 'code,name,departmentCode,departmentName,isActive,createdAt';
  const lines = rows.map(r => [
    csvEscape(r.code),
    csvEscape(r.name),
    csvEscape(r.department.code),
    csvEscape(r.department.name),
    r.isActive,
    r.createdAt.toISOString(),
  ].join(','));
  return [header, ...lines].join('\r\n');
}

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
