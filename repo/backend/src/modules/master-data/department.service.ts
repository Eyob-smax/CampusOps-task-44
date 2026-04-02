import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { writeAuditEntry } from "../admin/audit.service";
import { z } from "zod";

export const createDepartmentSchema = z.object({
  name: z.string().min(2).max(120).trim(),
  code: z.string().min(1).max(20).trim().toUpperCase(),
});

export const updateDepartmentSchema = z.object({
  name: z.string().min(2).max(120).trim().optional(),
  code: z.string().min(1).max(20).trim().toUpperCase().optional(),
  isActive: z.boolean().optional(),
});

export type CreateDepartmentDto = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentDto = z.infer<typeof updateDepartmentSchema>;

export async function listDepartments(activeOnly = false) {
  return prisma.department.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { name: "asc" },
  });
}

export async function getDepartmentById(id: string) {
  return prisma.department.findUnique({ where: { id } });
}

export async function createDepartment(
  dto: CreateDepartmentDto,
  actorId: string,
) {
  const payload = createDepartmentSchema.parse(dto);
  const data: Prisma.DepartmentCreateInput = {
    name: payload.name,
    code: payload.code,
  };
  const dept = await prisma.department.create({ data });
  await writeAuditEntry(actorId, "department:created", "department", dept.id, {
    name: dto.name,
    code: dto.code,
  });
  return dept;
}

export async function updateDepartment(
  id: string,
  dto: UpdateDepartmentDto,
  actorId: string,
) {
  const payload = updateDepartmentSchema.parse(dto);
  const data: Prisma.DepartmentUpdateInput = {};
  if (payload.name !== undefined) data.name = payload.name;
  if (payload.code !== undefined) data.code = payload.code;
  if (payload.isActive !== undefined) data.isActive = payload.isActive;

  const dept = await prisma.department.update({ where: { id }, data });
  await writeAuditEntry(actorId, "department:updated", "department", id, {
    changes: dto,
  });
  return dept;
}

export async function deactivateDepartment(id: string, actorId: string) {
  await prisma.department.update({ where: { id }, data: { isActive: false } });
  await writeAuditEntry(
    actorId,
    "department:deactivated",
    "department",
    id,
    {},
  );
}

export async function exportDepartmentsCsv(): Promise<string> {
  const rows = await prisma.department.findMany({ orderBy: { code: "asc" } });
  const header = "code,name,isActive,createdAt";
  const lines = rows.map((r) =>
    [
      csvEscape(r.code),
      csvEscape(r.name),
      r.isActive,
      r.createdAt.toISOString(),
    ].join(","),
  );
  return [header, ...lines].join("\r\n");
}

function csvEscape(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n"))
    return `"${v.replace(/"/g, '""')}"`;
  return v;
}
