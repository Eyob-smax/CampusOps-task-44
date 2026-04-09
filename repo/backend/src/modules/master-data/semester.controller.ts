import { Request, Response, NextFunction } from 'express';
import {
  listSemesters, getSemesterById, createSemester, updateSemester, exportSemestersCsv,
  createSemesterSchema, updateSemesterSchema,
} from './semester.service';
import {
  csvToXlsxBuffer,
  resolveMasterDataExportFormat,
  XLSX_CONTENT_TYPE,
} from './export-format';

export async function getSemesters(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const activeOnly = req.query['active'] === 'true';
    const data = await listSemesters(activeOnly);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getSemester(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sem = await getSemesterById(req.params.id);
    if (!sem) { res.status(404).json({ success: false, error: 'Semester not found', code: 'NOT_FOUND' }); return; }
    res.json({ success: true, data: sem });
  } catch (err) { next(err); }
}

export async function createSemesterHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = createSemesterSchema.parse(req.body);
    const sem = await createSemester(dto, req.user!.id);
    res.status(201).json({ success: true, data: sem });
  } catch (err) { next(err); }
}

export async function updateSemesterHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = updateSemesterSchema.parse(req.body);
    const sem = await updateSemester(req.params.id, dto, req.user!.id);
    res.json({ success: true, data: sem });
  } catch (err) { next(err); }
}

export async function exportSemestersHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const format = resolveMasterDataExportFormat(req.query['format']);
    if (!format) {
      res.status(400).json({
        success: false,
        error: 'format must be one of: csv, xlsx',
        code: 'INVALID_EXPORT_FORMAT',
      });
      return;
    }

    const csv = await exportSemestersCsv();
    if (format === 'xlsx') {
      const xlsx = csvToXlsxBuffer(csv);
      res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
      res.setHeader('Content-Disposition', `attachment; filename="semesters-${Date.now()}.xlsx"`);
      res.send(xlsx);
      return;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="semesters-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
}
