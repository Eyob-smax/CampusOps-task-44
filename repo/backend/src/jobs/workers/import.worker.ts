import { Worker } from "bullmq";
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { z } from "zod";
import { getRedisClient } from "../../lib/redis";
import { prisma } from "../../lib/prisma";
import { logger } from "../../lib/logger";
import { notifyJobProgress } from "../index";
import { config } from "../../config";
import { upsertStudentRaw } from "../../modules/master-data/student.service";

const connection = { connection: getRedisClient() };

export interface StudentImportJobData {
  jobRecordId: string;
  filePath: string;
  actorId: string;
  campusId?: string;
}

interface RowError {
  row: number;
  studentNumber: string;
  errors: string[];
}

const importRowSchema = z.object({
  studentNumber: z.string().trim().min(1).max(30),
  fullName: z.string().trim().min(2).max(200),
  email: z.string().email().toLowerCase(),
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
  departmentCode: z
    .string()
    .trim()
    .max(20)
    .toUpperCase()
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
  membershipTier: z
    .string()
    .trim()
    .max(80)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
});

function resolveField(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    if (raw[k] !== undefined && raw[k] !== null) return String(raw[k]);
  }
  return "";
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function csvEscape(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function writeErrorReport(jobRecordId: string, errors: RowError[]): string {
  const dir = path.join(config.storage.path, "error-reports");
  ensureDir(dir);
  const filePath = path.join(dir, `${jobRecordId}.csv`);
  const header = "row,studentNumber,errors";
  const lines = errors.map((e) =>
    [e.row, csvEscape(e.studentNumber), csvEscape(e.errors.join("; "))].join(","),
  );
  fs.writeFileSync(filePath, [header, ...lines].join("\r\n"), "utf-8");
  return filePath;
}

export async function processStudentImportJob(
  data: StudentImportJobData,
  options?: { bullJobId?: string; updateProgress?: (progress: number) => Promise<void> | void },
): Promise<void> {
  const { jobRecordId, filePath, actorId } = data;
  const campusId = data.campusId ?? "main-campus";

  logger.info({ msg: "Import worker started", jobRecordId, filePath, campusId });

  await prisma.jobRecord.update({
    where: { id: jobRecordId },
    data: {
      status: "active",
      startedAt: new Date(),
      bullJobId: options?.bullJobId,
    },
  });
  notifyJobProgress(jobRecordId, "active", 0, { phase: "parsing", campusId });

  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  await prisma.jobRecord.update({
    where: { id: jobRecordId },
    data: { totalRows: rawRows.length },
  });
  notifyJobProgress(jobRecordId, "active", 5, {
    totalRows: rawRows.length,
    campusId,
  });

  const [departments, membershipTiers, allStudents] = await Promise.all([
    prisma.department.findMany({ select: { id: true, code: true } }),
    prisma.membershipTier.findMany({ select: { id: true, name: true } }),
    prisma.student.findMany({
      select: { studentNumber: true, email: true, id: true, campusId: true },
    }),
  ]);

  const deptByCode = new Map(departments.map((d) => [d.code.toUpperCase(), d.id]));
  const tierByName = new Map(membershipTiers.map((t) => [t.name.toLowerCase(), t.id]));
  const emailIndex = new Map(allStudents.map((s) => [s.email.toLowerCase(), s.studentNumber]));
  const snIndex = new Map(
    allStudents.map((s) => [s.studentNumber, { id: s.id, campusId: s.campusId }]),
  );

  notifyJobProgress(jobRecordId, "active", 10, { phase: "validating", campusId });

  const errors: RowError[] = [];
  type ValidRow = z.infer<typeof importRowSchema> & {
    departmentId?: string;
    membershipTierId?: string;
  };
  const validRows: ValidRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 2;
    const raw = rawRows[i]!;

    const parsed = importRowSchema.safeParse({
      studentNumber: resolveField(
        raw,
        "studentNumber",
        "student_number",
        "Student Number",
        "StudentNumber",
      ),
      fullName: resolveField(raw, "fullName", "full_name", "Full Name", "FullName"),
      email: resolveField(raw, "email", "Email", "EMAIL"),
      phone: resolveField(raw, "phone", "Phone", "PHONE"),
      departmentCode: resolveField(
        raw,
        "departmentCode",
        "department_code",
        "Department Code",
        "DeptCode",
      ),
      membershipTier: resolveField(
        raw,
        "membershipTier",
        "membership_tier",
        "Membership Tier",
        "MembershipTier",
      ),
    });

    if (!parsed.success) {
      errors.push({
        row: rowNum,
        studentNumber: resolveField(raw, "studentNumber", "student_number", ""),
        errors: parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
      });
      continue;
    }

    const row = parsed.data;
    const rowErrors: string[] = [];

    let departmentId: string | undefined;
    if (row.departmentCode) {
      departmentId = deptByCode.get(row.departmentCode.toUpperCase());
      if (!departmentId) {
        rowErrors.push(`Unknown department code: ${row.departmentCode}`);
      }
    }

    let membershipTierId: string | undefined;
    if (row.membershipTier) {
      membershipTierId = tierByName.get(row.membershipTier.toLowerCase());
      if (!membershipTierId) {
        rowErrors.push(`Unknown membership tier: ${row.membershipTier}`);
      }
    }

    const existingByStudentNumber = snIndex.get(row.studentNumber);
    if (existingByStudentNumber && existingByStudentNumber.campusId !== campusId) {
      rowErrors.push(
        `Student number ${row.studentNumber} belongs to another campus and cannot be updated`,
      );
    }

    const existingStudentNum = emailIndex.get(row.email.toLowerCase());
    if (existingStudentNum && existingStudentNum !== row.studentNumber) {
      rowErrors.push(
        `Email ${row.email} is already registered to student ${existingStudentNum}`,
      );
    }

    if (rowErrors.length > 0) {
      errors.push({
        row: rowNum,
        studentNumber: row.studentNumber,
        errors: rowErrors,
      });
      continue;
    }

    validRows.push({ ...row, departmentId, membershipTierId });
  }

  notifyJobProgress(jobRecordId, "active", 20, {
    validRows: validRows.length,
    invalidRows: errors.length,
    campusId,
  });

  const BATCH = 50;
  let created = 0;
  let updated = 0;

  const workerRequester = {
    id: actorId,
    username: `worker:${actorId}`,
    role: "administrator" as const,
    campusId,
  };

  for (let b = 0; b < validRows.length; b += BATCH) {
    const batch = validRows.slice(b, b + BATCH);

    await Promise.all(
      batch.map(async (row, idx) => {
        try {
          const existing = snIndex.get(row.studentNumber);

          const saved = await upsertStudentRaw(
            {
              studentNumber: row.studentNumber,
              fullName: row.fullName,
              email: row.email,
              phone: row.phone,
              departmentId: row.departmentId,
              membershipTierId: row.membershipTierId,
            },
            workerRequester,
          );

          if (existing && existing.campusId === campusId) updated++;
          else created++;

          snIndex.set(row.studentNumber, { id: saved.id, campusId });
          emailIndex.set(row.email.toLowerCase(), row.studentNumber);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push({
            row: b + idx + 2,
            studentNumber: row.studentNumber,
            errors: [msg],
          });
        }
      }),
    );

    const progress =
      validRows.length === 0
        ? 95
        : 20 + Math.floor(((b + batch.length) / validRows.length) * 75);

    if (options?.updateProgress) {
      await options.updateProgress(progress);
    }

    await prisma.jobRecord.update({
      where: { id: jobRecordId },
      data: {
        progress,
        processedRows: created + updated,
        failedRows: errors.length,
      },
    });

    notifyJobProgress(jobRecordId, "active", progress, {
      created,
      updated,
      failed: errors.length,
      campusId,
    });
  }

  let errorReportPath: string | null = null;
  if (errors.length > 0) {
    errorReportPath = writeErrorReport(jobRecordId, errors);
  }

  const result = JSON.stringify({
    created,
    updated,
    failed: errors.length,
    totalErrors: errors.length,
    errorReportPath,
    campusId,
  });

  await prisma.jobRecord.update({
    where: { id: jobRecordId },
    data: {
      status: "completed",
      progress: 100,
      processedRows: created + updated,
      failedRows: errors.length,
      finishedAt: new Date(),
      result,
    },
  });

  notifyJobProgress(jobRecordId, "completed", 100, {
    created,
    updated,
    failed: errors.length,
    errorReportPath,
    campusId,
  });

  logger.info({
    msg: "Import worker completed",
    jobRecordId,
    created,
    updated,
    failed: errors.length,
    campusId,
  });
}

export const importWorker = new Worker(
  "campusops-bulk-import",
  async (bullJob) => {
    const data = bullJob.data as StudentImportJobData;
    await processStudentImportJob(data, {
      bullJobId: String(bullJob.id),
      updateProgress: (progress) => bullJob.updateProgress(progress),
    });
  },
  connection,
);

// Handle BullMQ-level failures (unhandled exceptions in the handler)
importWorker.on("failed", async (bullJob, err) => {
  if (!bullJob) return;
  const { jobRecordId } = bullJob.data as { jobRecordId: string };
  try {
    await prisma.jobRecord.update({
      where: { id: jobRecordId },
      data: {
        status: "failed",
        errorMsg: err.message,
        finishedAt: new Date(),
      },
    });
    notifyJobProgress(jobRecordId, "failed", 0, { error: err.message });
  } catch (updateErr) {
    logger.error({
      msg: "Failed to update JobRecord on worker failure",
      jobRecordId,
      err: updateErr,
    });
  }
});

importWorker.on("error", (err) => {
  logger.error({ msg: "Import worker connection error", err });
});
