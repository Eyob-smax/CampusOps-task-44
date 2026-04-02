import { Request, Response, NextFunction } from 'express';
import {
  listSemesters, getSemesterById, createSemester, updateSemester, exportSemestersCsv,
  createSemesterSchema, updateSemesterSchema,
} from './semester.service';

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

export async function exportSemestersHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const csv = await exportSemestersCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="semesters-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
}
