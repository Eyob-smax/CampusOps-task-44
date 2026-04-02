import { prisma } from '../../lib/prisma';
import { writeAuditEntry } from '../admin/audit.service';
import { z } from 'zod';

export const createSemesterSchema = z.object({
  name: z.string().min(2).max(80).trim(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD'),
  isActive: z.boolean().optional().default(true),
}).refine(d => new Date(d.endDate) > new Date(d.startDate), { message: 'endDate must be after startDate', path: ['endDate'] });

export const updateSemesterSchema = z.object({
  name: z.string().min(2).max(80).trim().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  isActive: z.boolean().optional(),
});

export type CreateSemesterDto = z.infer<typeof createSemesterSchema>;
export type UpdateSemesterDto = z.infer<typeof updateSemesterSchema>;

export async function listSemesters(activeOnly = false) {
  return prisma.semester.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { startDate: 'desc' },
  });
}

export async function getSemesterById(id: string) {
  return prisma.semester.findUnique({ where: { id } });
}

export async function createSemester(dto: CreateSemesterDto, actorId: string) {
  const sem = await prisma.semester.create({
    data: {
      name: dto.name,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      isActive: dto.isActive,
    },
  });
  await writeAuditEntry(actorId, 'semester:created', 'semester', sem.id, { name: dto.name });
  return sem;
}

export async function exportSemestersCsv(): Promise<string> {
  const rows = await prisma.semester.findMany({ orderBy: { startDate: 'desc' } });
  const header = 'name,startDate,endDate,isActive,createdAt';
  const lines = rows.map(r => [
    csvEscape(r.name),
    r.startDate.toISOString().slice(0, 10),
    r.endDate.toISOString().slice(0, 10),
    r.isActive,
    r.createdAt.toISOString(),
  ].join(','));
  return [header, ...lines].join('\r\n');
}

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function updateSemester(id: string, dto: UpdateSemesterDto, actorId: string) {
  const data: Record<string, unknown> = {};
  if (dto.name      !== undefined) data['name']      = dto.name;
  if (dto.isActive  !== undefined) data['isActive']  = dto.isActive;
  if (dto.startDate !== undefined) data['startDate'] = new Date(dto.startDate);
  if (dto.endDate   !== undefined) data['endDate']   = new Date(dto.endDate);
  const sem = await prisma.semester.update({ where: { id }, data });
  await writeAuditEntry(actorId, 'semester:updated', 'semester', id, { changes: dto });
  return sem;
}
