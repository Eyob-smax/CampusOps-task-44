import * as XLSX from "xlsx";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { writeAuditEntry } from "../admin/audit.service";

export interface MasterImportError {
  row: number;
  key: string;
  errors: string[];
}

export interface MasterImportResult {
  created: number;
  updated: number;
  failed: number;
  totalRows: number;
  errors: MasterImportError[];
  errorReportCsv: string | null;
}

function readSheetRows(buffer: Buffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
}

function resolveField(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null) return String(value).trim();
  }
  return "";
}

function parseIsActive(rawValue: string): boolean {
  const normalized = rawValue.trim().toLowerCase();
  if (!normalized) return true;
  return ["true", "1", "yes", "y", "active"].includes(normalized);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function normalizeDateValue(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const maybeExcelSerial = Number(trimmed);
  if (Number.isFinite(maybeExcelSerial) && maybeExcelSerial > 59) {
    const parts = XLSX.SSF.parse_date_code(maybeExcelSerial);
    if (parts) {
      return `${parts.y}-${pad2(parts.m)}-${pad2(parts.d)}`;
    }
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toErrorCsv(errors: MasterImportError[]): string {
  const header = "row,key,errors";
  const lines = errors.map((error) =>
    [error.row, csvEscape(error.key), csvEscape(error.errors.join("; "))].join(
      ",",
    ),
  );
  return [header, ...lines].join("\r\n");
}

function finalizeResult(
  totalRows: number,
  created: number,
  updated: number,
  errors: MasterImportError[],
): MasterImportResult {
  return {
    created,
    updated,
    failed: errors.length,
    totalRows,
    errors,
    errorReportCsv: errors.length > 0 ? toErrorCsv(errors) : null,
  };
}

const departmentRowSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(20)
    .transform((v) => v.trim().toUpperCase()),
  name: z
    .string()
    .min(2)
    .max(120)
    .transform((v) => v.trim()),
  isActive: z.boolean(),
});

export async function importDepartmentsFromBuffer(
  buffer: Buffer,
  actorId: string,
): Promise<MasterImportResult> {
  const rows = readSheetRows(buffer);
  const errors: MasterImportError[] = [];
  let created = 0;
  let updated = 0;

  for (let idx = 0; idx < rows.length; idx++) {
    const rowNum = idx + 2;
    const raw = rows[idx]!;

    const parsed = departmentRowSchema.safeParse({
      code: resolveField(
        raw,
        "code",
        "Code",
        "departmentCode",
        "department_code",
      ),
      name: resolveField(
        raw,
        "name",
        "Name",
        "departmentName",
        "department_name",
      ),
      isActive: parseIsActive(
        resolveField(raw, "isActive", "is_active", "active", "Active"),
      ),
    });

    if (!parsed.success) {
      errors.push({
        row: rowNum,
        key: resolveField(
          raw,
          "code",
          "Code",
          "departmentCode",
          "department_code",
        ),
        errors: parsed.error.errors.map(
          (e) => `${e.path.join(".")}: ${e.message}`,
        ),
      });
      continue;
    }

    const data = parsed.data;
    try {
      const existing = await prisma.department.findUnique({
        where: { code: data.code },
      });
      if (existing) {
        await prisma.department.update({
          where: { id: existing.id },
          data: { name: data.name, isActive: data.isActive },
        });
        updated++;
      } else {
        await prisma.department.create({
          data: { code: data.code, name: data.name, isActive: data.isActive },
        });
        created++;
      }
    } catch (err) {
      errors.push({
        row: rowNum,
        key: data.code,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  await writeAuditEntry(
    actorId,
    "department:bulk-import",
    "department",
    "bulk",
    {
      totalRows: rows.length,
      created,
      updated,
      failed: errors.length,
    },
  );

  return finalizeResult(rows.length, created, updated, errors);
}

const semesterRowSchema = z
  .object({
    name: z
      .string()
      .min(2)
      .max(80)
      .transform((v) => v.trim()),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    isActive: z.boolean(),
  })
  .refine((value) => new Date(value.endDate) > new Date(value.startDate), {
    message: "endDate must be after startDate",
    path: ["endDate"],
  });

export async function importSemestersFromBuffer(
  buffer: Buffer,
  actorId: string,
): Promise<MasterImportResult> {
  const rows = readSheetRows(buffer);
  const errors: MasterImportError[] = [];
  let created = 0;
  let updated = 0;

  for (let idx = 0; idx < rows.length; idx++) {
    const rowNum = idx + 2;
    const raw = rows[idx]!;

    const startDate = normalizeDateValue(
      resolveField(raw, "startDate", "start_date", "Start Date"),
    );
    const endDate = normalizeDateValue(
      resolveField(raw, "endDate", "end_date", "End Date"),
    );

    const parsed = semesterRowSchema.safeParse({
      name: resolveField(raw, "name", "Name", "semesterName", "semester_name"),
      startDate: startDate ?? "",
      endDate: endDate ?? "",
      isActive: parseIsActive(
        resolveField(raw, "isActive", "is_active", "active", "Active"),
      ),
    });

    if (!parsed.success) {
      errors.push({
        row: rowNum,
        key: resolveField(raw, "name", "Name", "semesterName", "semester_name"),
        errors: parsed.error.errors.map(
          (e) => `${e.path.join(".")}: ${e.message}`,
        ),
      });
      continue;
    }

    const data = parsed.data;

    try {
      const existing = await prisma.semester.findUnique({
        where: { name: data.name },
      });
      const payload = {
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        isActive: data.isActive,
      };

      if (existing) {
        await prisma.semester.update({
          where: { id: existing.id },
          data: payload,
        });
        updated++;
      } else {
        await prisma.semester.create({
          data: { name: data.name, ...payload },
        });
        created++;
      }
    } catch (err) {
      errors.push({
        row: rowNum,
        key: data.name,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  await writeAuditEntry(actorId, "semester:bulk-import", "semester", "bulk", {
    totalRows: rows.length,
    created,
    updated,
    failed: errors.length,
  });

  return finalizeResult(rows.length, created, updated, errors);
}

const courseRowSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(20)
    .transform((v) => v.trim().toUpperCase()),
  name: z
    .string()
    .min(2)
    .max(200)
    .transform((v) => v.trim()),
  departmentCode: z
    .string()
    .min(1)
    .max(20)
    .transform((v) => v.trim().toUpperCase()),
  isActive: z.boolean(),
});

export async function importCoursesFromBuffer(
  buffer: Buffer,
  actorId: string,
): Promise<MasterImportResult> {
  const rows = readSheetRows(buffer);
  const departments = await prisma.department.findMany({
    select: { id: true, code: true },
  });
  const departmentByCode = new Map(
    departments.map((d) => [d.code.toUpperCase(), d.id]),
  );

  const errors: MasterImportError[] = [];
  let created = 0;
  let updated = 0;

  for (let idx = 0; idx < rows.length; idx++) {
    const rowNum = idx + 2;
    const raw = rows[idx]!;

    const parsed = courseRowSchema.safeParse({
      code: resolveField(raw, "code", "Code", "courseCode", "course_code"),
      name: resolveField(raw, "name", "Name", "courseName", "course_name"),
      departmentCode: resolveField(
        raw,
        "departmentCode",
        "department_code",
        "Department Code",
        "deptCode",
      ),
      isActive: parseIsActive(
        resolveField(raw, "isActive", "is_active", "active", "Active"),
      ),
    });

    if (!parsed.success) {
      errors.push({
        row: rowNum,
        key: resolveField(raw, "code", "Code", "courseCode", "course_code"),
        errors: parsed.error.errors.map(
          (e) => `${e.path.join(".")}: ${e.message}`,
        ),
      });
      continue;
    }

    const data = parsed.data;
    const departmentId = departmentByCode.get(data.departmentCode);
    if (!departmentId) {
      errors.push({
        row: rowNum,
        key: data.code,
        errors: [`Unknown department code: ${data.departmentCode}`],
      });
      continue;
    }

    try {
      const existing = await prisma.course.findUnique({
        where: { code: data.code },
      });
      if (existing) {
        await prisma.course.update({
          where: { id: existing.id },
          data: { name: data.name, departmentId, isActive: data.isActive },
        });
        updated++;
      } else {
        await prisma.course.create({
          data: {
            code: data.code,
            name: data.name,
            departmentId,
            isActive: data.isActive,
          },
        });
        created++;
      }
    } catch (err) {
      errors.push({
        row: rowNum,
        key: data.code,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  await writeAuditEntry(actorId, "course:bulk-import", "course", "bulk", {
    totalRows: rows.length,
    created,
    updated,
    failed: errors.length,
  });

  return finalizeResult(rows.length, created, updated, errors);
}

const classRowSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(200)
    .transform((v) => v.trim()),
  courseCode: z
    .string()
    .min(1)
    .max(20)
    .transform((v) => v.trim().toUpperCase()),
  departmentCode: z
    .string()
    .min(1)
    .max(20)
    .transform((v) => v.trim().toUpperCase()),
  semesterName: z
    .string()
    .min(2)
    .max(80)
    .transform((v) => v.trim()),
  roomNumber: z
    .string()
    .max(20)
    .transform((v) => v.trim()),
  isActive: z.boolean(),
});

export async function importClassesFromBuffer(
  buffer: Buffer,
  actorId: string,
): Promise<MasterImportResult> {
  const rows = readSheetRows(buffer);

  const [courses, departments, semesters] = await Promise.all([
    prisma.course.findMany({ select: { id: true, code: true } }),
    prisma.department.findMany({ select: { id: true, code: true } }),
    prisma.semester.findMany({ select: { id: true, name: true } }),
  ]);

  const courseByCode = new Map(
    courses.map((c) => [c.code.toUpperCase(), c.id]),
  );
  const departmentByCode = new Map(
    departments.map((d) => [d.code.toUpperCase(), d.id]),
  );
  const semesterByName = new Map(
    semesters.map((s) => [s.name.toLowerCase(), s.id]),
  );

  const errors: MasterImportError[] = [];
  let created = 0;
  let updated = 0;

  for (let idx = 0; idx < rows.length; idx++) {
    const rowNum = idx + 2;
    const raw = rows[idx]!;

    const parsed = classRowSchema.safeParse({
      name: resolveField(raw, "name", "Name", "className", "class_name"),
      courseCode: resolveField(raw, "courseCode", "course_code", "Course Code"),
      departmentCode: resolveField(
        raw,
        "departmentCode",
        "department_code",
        "Department Code",
      ),
      semesterName: resolveField(
        raw,
        "semesterName",
        "semester_name",
        "Semester Name",
      ),
      roomNumber: resolveField(raw, "roomNumber", "room_number", "Room Number"),
      isActive: parseIsActive(
        resolveField(raw, "isActive", "is_active", "active", "Active"),
      ),
    });

    if (!parsed.success) {
      errors.push({
        row: rowNum,
        key: resolveField(raw, "name", "Name", "className", "class_name"),
        errors: parsed.error.errors.map(
          (e) => `${e.path.join(".")}: ${e.message}`,
        ),
      });
      continue;
    }

    const data = parsed.data;
    const courseId = courseByCode.get(data.courseCode);
    const departmentId = departmentByCode.get(data.departmentCode);
    const semesterId = semesterByName.get(data.semesterName.toLowerCase());

    const relationErrors: string[] = [];
    if (!courseId)
      relationErrors.push(`Unknown course code: ${data.courseCode}`);
    if (!departmentId)
      relationErrors.push(`Unknown department code: ${data.departmentCode}`);
    if (!semesterId)
      relationErrors.push(`Unknown semester name: ${data.semesterName}`);

    if (relationErrors.length > 0) {
      errors.push({ row: rowNum, key: data.name, errors: relationErrors });
      continue;
    }

    const resolvedCourseId = courseId as string;
    const resolvedDepartmentId = departmentId as string;
    const resolvedSemesterId = semesterId as string;
    const roomNumber = data.roomNumber || null;

    try {
      const existing = await prisma.class.findFirst({
        where: {
          courseId: resolvedCourseId,
          semesterId: resolvedSemesterId,
          roomNumber,
        },
      });

      if (existing) {
        await prisma.class.update({
          where: { id: existing.id },
          data: {
            name: data.name,
            departmentId: resolvedDepartmentId,
            isActive: data.isActive,
          },
        });
        updated++;
      } else {
        await prisma.class.create({
          data: {
            name: data.name,
            courseId: resolvedCourseId,
            departmentId: resolvedDepartmentId,
            semesterId: resolvedSemesterId,
            roomNumber,
            isActive: data.isActive,
          },
        });
        created++;
      }
    } catch (err) {
      errors.push({
        row: rowNum,
        key: data.name,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  await writeAuditEntry(actorId, "class:bulk-import", "class", "bulk", {
    totalRows: rows.length,
    created,
    updated,
    failed: errors.length,
  });

  return finalizeResult(rows.length, created, updated, errors);
}
