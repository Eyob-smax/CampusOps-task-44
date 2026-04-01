import { Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import {
  importDepartmentsFromBuffer,
  importSemestersFromBuffer,
  importCoursesFromBuffer,
  importClassesFromBuffer,
} from "./master-import.service";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const uploadMasterDataImportFile = upload.single("file");

function validateUploadedFile(req: Request, res: Response): Buffer | null {
  if (!req.file) {
    res.status(400).json({
      success: false,
      error: "No file uploaded",
      code: "MISSING_FILE",
    });
    return null;
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (![".xlsx", ".csv"].includes(ext)) {
    res.status(400).json({
      success: false,
      error: "Only .xlsx and .csv files are accepted",
      code: "INVALID_FILE_TYPE",
    });
    return null;
  }

  return req.file.buffer;
}

export async function importDepartmentsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const fileBuffer = validateUploadedFile(req, res);
    if (!fileBuffer) return;

    const result = await importDepartmentsFromBuffer(fileBuffer, req.user!.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function importSemestersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const fileBuffer = validateUploadedFile(req, res);
    if (!fileBuffer) return;

    const result = await importSemestersFromBuffer(fileBuffer, req.user!.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function importCoursesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const fileBuffer = validateUploadedFile(req, res);
    if (!fileBuffer) return;

    const result = await importCoursesFromBuffer(fileBuffer, req.user!.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function importClassesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const fileBuffer = validateUploadedFile(req, res);
    if (!fileBuffer) return;

    const result = await importClassesFromBuffer(fileBuffer, req.user!.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
