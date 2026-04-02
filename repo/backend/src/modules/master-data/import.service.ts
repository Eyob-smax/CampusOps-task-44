/**
 * Bulk import service for students via Excel (.xlsx) or CSV.
 * Returns per-row validation results; failed rows never reach the DB.
 * Successful rows are upserted by studentNumber.
 */
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { upsertStudentRaw } from './student.service';
import { writeAuditEntry } from '../admin/audit.service';

const importRowSchema = z.object({
  studentNumber: z.string().min(1).max(30).trim(),
  fullName:      z.string().min(2).max(200).trim(),
  email:         z.string().email().toLowerCase(),
  phone:         z.string().max(20).trim().optional().or(z.literal('')).transform(v => v || undefined),
  departmentCode: z.string().max(20).trim().optional().or(z.literal('')).transform(v => v || undefined),
  membershipTier: z.string().max(50).trim().optional().or(z.literal('')).transform(v => v || undefined),
});

export interface ImportRowError {
  row: number;
  studentNumber: string;
  errors: string[];
}

export interface ImportResult {
  created: number;
  updated: number;
  failed: number;
  errors: ImportRowError[];
}

/**
 * @param buffer  Raw file buffer (.xlsx or .csv)
 * @param mime    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or 'text/csv'
 * @param actorId User ID performing the import
 */
export async function importStudents(
  buffer: Buffer,
  mime: string,
  actorId: string,
): Promise<ImportResult> {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  // Pre-fetch lookups
  const [departments, membershipTiers] = await Promise.all([
    prisma.department.findMany({ select: { id: true, code: true } }),
    prisma.membershipTier.findMany({ select: { id: true, name: true } }),
  ]);
  const deptByCode = new Map(departments.map(d => [d.code.toUpperCase(), d.id]));
  const tierByName = new Map(membershipTiers.map(t => [t.name.toLowerCase(), t.id]));

  const errors: ImportRowError[] = [];
  let created = 0;
  let updated = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 2; // 1-indexed, row 1 is header
    const raw = rawRows[i]!;

    const parseResult = importRowSchema.safeParse({
      studentNumber:  String(raw['studentNumber'] ?? raw['student_number'] ?? raw['Student Number'] ?? ''),
      fullName:       String(raw['fullName']      ?? raw['full_name']      ?? raw['Full Name']      ?? ''),
      email:          String(raw['email']         ?? raw['Email']          ?? ''),
      phone:          String(raw['phone']         ?? raw['Phone']          ?? ''),
      departmentCode: String(raw['departmentCode'] ?? raw['department_code'] ?? raw['Department Code'] ?? ''),
      membershipTier: String(raw['membershipTier'] ?? raw['membership_tier'] ?? raw['Membership Tier'] ?? ''),
    });

    if (!parseResult.success) {
      errors.push({
        row: rowNum,
        studentNumber: String(raw['studentNumber'] ?? raw['student_number'] ?? ''),
        errors: parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
      });
      continue;
    }

    const data = parseResult.data;
    const rowErrors: string[] = [];

    // Resolve department code → ID
    let departmentId: string | undefined;
    if (data.departmentCode) {
      departmentId = deptByCode.get(data.departmentCode.toUpperCase());
      if (!departmentId) rowErrors.push(`Unknown department code: ${data.departmentCode}`);
    }

    // Resolve membership tier name → ID
    let membershipTierId: string | undefined;
    if (data.membershipTier) {
      membershipTierId = tierByName.get(data.membershipTier.toLowerCase());
      if (!membershipTierId) rowErrors.push(`Unknown membership tier: ${data.membershipTier}`);
    }

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, studentNumber: data.studentNumber, errors: rowErrors });
      continue;
    }

    try {
      const existing = await prisma.student.findUnique({
        where: { studentNumber: data.studentNumber },
        select: { id: true },
      });

      await upsertStudentRaw({
        studentNumber: data.studentNumber,
        fullName:      data.fullName,
        email:         data.email,
        phone:         data.phone,
        departmentId,
        membershipTierId,
      });

      if (existing) {
        updated++;
      } else {
        created++;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ row: rowNum, studentNumber: data.studentNumber, errors: [msg] });
    }
  }

  await writeAuditEntry(actorId, 'student:bulk-import', 'student', 'bulk', {
    created,
    updated,
    failed: errors.length,
    totalRows: rawRows.length,
  });

  return { created, updated, failed: errors.length, errors };
}

/** Convert ImportRowError[] to a downloadable CSV string */
export function errorsToCSV(errors: ImportRowError[]): string {
  const header = 'row,studentNumber,errors';
  const lines = errors.map(e =>
    [e.row, csvEscape(e.studentNumber), csvEscape(e.errors.join('; '))].join(','),
  );
  return [header, ...lines].join('\r\n');
}

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
