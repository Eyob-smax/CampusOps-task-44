import { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import {
  listStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deactivateStudent,
  exportStudentsCsv,
  createStudentSchema,
  updateStudentSchema,
} from "./student.service";
import { importQueue } from "../../jobs/index";
import { createJobRecord, getJobByIdempotencyKey } from "../jobs/job.service";
import { config } from "../../config";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});
export const uploadMiddleware = upload.single("file");

function ensureDir(p: string): void {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// ---- CRUD ----

export async function getStudents(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await listStudents(
      {
        search: req.query["search"] as string | undefined,
        departmentId: req.query["departmentId"] as string | undefined,
        isActive:
          req.query["active"] !== undefined
            ? req.query["active"] === "true"
            : undefined,
        page: req.query["page"] ? Number(req.query["page"]) : undefined,
        limit: req.query["limit"] ? Number(req.query["limit"]) : undefined,
      },
      req.user!.role,
    );
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getStudent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const student = await getStudentById(req.params.id, req.user!.role);
    if (!student) {
      res
        .status(404)
        .json({
          success: false,
          error: "Student not found",
          code: "NOT_FOUND",
        });
      return;
    }
    res.json({ success: true, data: student });
  } catch (err) {
    next(err);
  }
}

export async function createStudentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dto = createStudentSchema.parse(req.body);
    const student = await createStudent(dto, req.user!.id, req.user!.role);
    res.status(201).json({ success: true, data: student });
  } catch (err) {
    next(err);
  }
}

export async function updateStudentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dto = updateStudentSchema.parse(req.body);
    const student = await updateStudent(
      req.params.id,
      dto,
      req.user!.id,
      req.user!.role,
    );
    res.json({ success: true, data: student });
  } catch (err) {
    next(err);
  }
}

export async function deactivateStudentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await deactivateStudent(req.params.id, req.user!.id);
    res.json({ success: true, message: "Student deactivated" });
  } catch (err) {
    next(err);
  }
}

// ---- Bulk import (background job) ----

export async function importStudentsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.file) {
      res
        .status(400)
        .json({
          success: false,
          error: "No file uploaded",
          code: "MISSING_FILE",
        });
      return;
    }

    const allowedExts = [".xlsx", ".csv"];
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!allowedExts.includes(ext)) {
      res
        .status(400)
        .json({
          success: false,
          error: "Only .xlsx and .csv files are accepted",
          code: "INVALID_FILE_TYPE",
        });
      return;
    }

    const idempotencyKey = req.headers["x-idempotency-key"] as
      | string
      | undefined;

    // Idempotency: return existing job if same key was used
    if (idempotencyKey) {
      const existing = await getJobByIdempotencyKey(idempotencyKey);
      if (existing) {
        res.status(202).json({ success: true, data: existing, cached: true });
        return;
      }
    }

    // Save file to storage
    const importsDir = path.join(config.storage.path, "imports");
    ensureDir(importsDir);

    // Create JobRecord first to get the ID for the filename
    const jobRecord = await createJobRecord({
      queueName: "campusops-bulk-import",
      jobName: "student-import",
      actorId: req.user!.id,
      idempotencyKey,
      inputFilename: req.file.originalname,
    });

    const filePath = path.join(importsDir, `${jobRecord.id}${ext}`);
    fs.writeFileSync(filePath, req.file.buffer);

    // Enqueue background job
    const bullJob = await importQueue.add("student-import", {
      jobRecordId: jobRecord.id,
      filePath,
      actorId: req.user!.id,
    });

    // Update record with BullMQ job ID
    await import("../jobs/job.service").then((m) =>
      m.updateJobRecord(jobRecord.id, { bullJobId: String(bullJob.id) }),
    );

    res.status(202).json({
      success: true,
      data: {
        jobId: jobRecord.id,
        status: "waiting",
        message: "Import queued — poll GET /api/jobs/:jobId for status",
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---- Export ----

export async function exportStudentsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const csv = await exportStudentsCsv(req.user!.role);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="students-${Date.now()}.csv"`,
    );
    res.send(csv);
  } catch (err) {
    next(err);
  }
}
