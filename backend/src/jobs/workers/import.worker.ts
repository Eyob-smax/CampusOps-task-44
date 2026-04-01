/**
 * BullMQ worker — student bulk import
 *
 * Job payload: { jobRecordId: string, filePath: string, actorId: string }
 *
 * Lifecycle:
 *   1. Mark JobRecord active
 *   2. Parse xlsx/csv from filePath
 *   3. Pre-fetch lookup tables (departments, tiers) — single round-trip
 *   4. Validate each row with Zod + DB cross-checks (duplicate email, unknown refs)
 *   5. Upsert valid rows in batches of 50
 *   6. Write error-report CSV to storage/error-reports/ if any rows failed
 *   7. Mark JobRecord completed with counts + errorReportPath
 *   8. Notify over Socket.IO /jobs namespace
 *   9. On any unhandled exception → mark JobRecord failed
 */
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

const connection = { connection: getRedisClient() };

// ---- Row schema (accepts multiple column name variants) ----
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

interface RowError {
  row: number;
  studentNumber: string;
  errors: string[];
}

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
  if (v.includes(",") || v.includes('"') || v.includes("\n"))
    return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function writeErrorReport(jobRecordId: string, errors: RowError[]): string {
  const dir = path.join(config.storage.path, "error-reports");
  ensureDir(dir);
  const filePath = path.join(dir, `${jobRecordId}.csv`);
  const header = "row,studentNumber,errors";
  const lines = errors.map((e) =>
    [e.row, csvEscape(e.studentNumber), csvEscape(e.errors.join("; "))].join(
      ",",
    ),
  );
  fs.writeFileSync(filePath, [header, ...lines].join("\r\n"), "utf-8");
  return filePath;
}

// ---- Worker ----
export const importWorker = new Worker(
  "campusops-bulk-import",
  async (bullJob) => {
    const { jobRecordId, filePath, actorId } = bullJob.data as {
      jobRecordId: string;
      filePath: string;
      actorId: string;
    };

    logger.info({ msg: "Import worker started", jobRecordId, filePath });

    await prisma.jobRecord.update({
      where: { id: jobRecordId },
      data: {
        status: "active",
        startedAt: new Date(),
        bullJobId: String(bullJob.id),
      },
    });
    notifyJobProgress(jobRecordId, "active", 0, { phase: "parsing" });

    // ---- 1. Parse file ----
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
    notifyJobProgress(jobRecordId, "active", 5, { totalRows: rawRows.length });

    // ---- 2. Pre-fetch lookups ----
    const [departments, membershipTiers, allStudents] = await Promise.all([
      prisma.department.findMany({ select: { id: true, code: true } }),
      prisma.membershipTier.findMany({ select: { id: true, name: true } }),
      prisma.student.findMany({
        select: { studentNumber: true, email: true, id: true },
      }),
    ]);

    const deptByCode = new Map(
      departments.map((d) => [d.code.toUpperCase(), d.id]),
    );
    const tierByName = new Map(
      membershipTiers.map((t) => [t.name.toLowerCase(), t.id]),
    );
    // email → studentNumber (for duplicate-email cross-check)
    const emailIndex = new Map(
      allStudents.map((s) => [s.email.toLowerCase(), s.studentNumber]),
    );
    // studentNumber → id (to detect existing-vs-create for progress counting)
    const snIndex = new Map(allStudents.map((s) => [s.studentNumber, s.id]));

    notifyJobProgress(jobRecordId, "active", 10, { phase: "validating" });

    // ---- 3. Validate all rows first ----
    const errors: RowError[] = [];
    type ValidRow = z.infer<typeof importRowSchema> & {
      departmentId?: string;
      membershipTierId?: string;
    };
    const validRows: ValidRow[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const rowNum = i + 2; // row 1 = header
      const raw = rawRows[i]!;

      const parsed = importRowSchema.safeParse({
        studentNumber: resolveField(
          raw,
          "studentNumber",
          "student_number",
          "Student Number",
          "StudentNumber",
        ),
        fullName: resolveField(
          raw,
          "fullName",
          "full_name",
          "Full Name",
          "FullName",
        ),
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
          studentNumber: resolveField(
            raw,
            "studentNumber",
            "student_number",
            "",
          ),
          errors: parsed.error.errors.map(
            (e) => `${e.path.join(".")}: ${e.message}`,
          ),
        });
        continue;
      }

      const data = parsed.data;
      const rowErrors: string[] = [];

      // Resolve department
      let departmentId: string | undefined;
      if (data.departmentCode) {
        departmentId = deptByCode.get(data.departmentCode.toUpperCase());
        if (!departmentId)
          rowErrors.push(`Unknown department code: ${data.departmentCode}`);
      }

      // Resolve membership tier
      let membershipTierId: string | undefined;
      if (data.membershipTier) {
        membershipTierId = tierByName.get(data.membershipTier.toLowerCase());
        if (!membershipTierId)
          rowErrors.push(`Unknown membership tier: ${data.membershipTier}`);
      }

      // Duplicate email cross-check (email used by a DIFFERENT student number)
      const existingStudentNum = emailIndex.get(data.email.toLowerCase());
      if (existingStudentNum && existingStudentNum !== data.studentNumber) {
        rowErrors.push(
          `Email ${data.email} is already registered to student ${existingStudentNum}`,
        );
      }

      if (rowErrors.length > 0) {
        errors.push({
          row: rowNum,
          studentNumber: data.studentNumber,
          errors: rowErrors,
        });
        continue;
      }

      validRows.push({ ...data, departmentId, membershipTierId });
    }

    notifyJobProgress(jobRecordId, "active", 20, {
      validRows: validRows.length,
      invalidRows: errors.length,
    });

    // ---- 4. Upsert valid rows in batches of 50 ----
    const BATCH = 50;
    let created = 0;
    let updated = 0;
    let failed = 0;

    for (let b = 0; b < validRows.length; b += BATCH) {
      const batch = validRows.slice(b, b + BATCH);
      await Promise.all(
        batch.map(async (row, idx) => {
          try {
            const existing = snIndex.get(row.studentNumber);
            await prisma.student.upsert({
              where: { studentNumber: row.studentNumber },
              create: {
                studentNumber: row.studentNumber,
                fullName: row.fullName,
                email: row.email,
                phone: row.phone,
                departmentId: row.departmentId,
                membershipTierId: row.membershipTierId,
              },
              update: {
                fullName: row.fullName,
                email: row.email,
                phone: row.phone,
                departmentId: row.departmentId,
                membershipTierId: row.membershipTierId,
              },
              select: { id: true },
            });
            if (existing) updated++;
            else created++;
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            failed++;
            errors.push({
              row: b + idx + 2,
              studentNumber: row.studentNumber,
              errors: [msg],
            });
          }
        }),
      );

      const progress =
        20 + Math.floor(((b + batch.length) / validRows.length) * 75);
      await bullJob.updateProgress(progress);
      await prisma.jobRecord.update({
        where: { id: jobRecordId },
        data: {
          progress,
          processedRows: created + updated,
          failedRows: failed + errors.length,
        },
      });
      notifyJobProgress(jobRecordId, "active", progress, {
        created,
        updated,
        failed,
      });
    }

    // ---- 5. Write error report ----
    let errorReportPath: string | null = null;
    if (errors.length > 0) {
      errorReportPath = writeErrorReport(jobRecordId, errors);
    }

    // ---- 6. Finalize ----
    const result = JSON.stringify({
      created,
      updated,
      failed,
      totalErrors: errors.length,
      errorReportPath,
    });
    await prisma.jobRecord.update({
      where: { id: jobRecordId },
      data: {
        status: "completed",
        progress: 100,
        processedRows: created + updated,
        failedRows: failed + errors.length - failed, // validation + db errors
        finishedAt: new Date(),
        result,
      },
    });

    notifyJobProgress(jobRecordId, "completed", 100, {
      created,
      updated,
      failed: errors.length,
      errorReportPath,
    });
    logger.info({
      msg: "Import worker completed",
      jobRecordId,
      created,
      updated,
      failed: errors.length,
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
