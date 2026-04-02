import { Request, Response, NextFunction } from 'express';
import {
  listCourses, getCourseById, createCourse, updateCourse, exportCoursesCsv,
  createCourseSchema, updateCourseSchema,
} from './course.service';

export async function getCourses(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const departmentId = req.query['departmentId'] as string | undefined;
    const activeOnly   = req.query['active'] === 'true';
    const data = await listCourses(departmentId, activeOnly);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getCourse(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const course = await getCourseById(req.params.id);
    if (!course) { res.status(404).json({ success: false, error: 'Course not found', code: 'NOT_FOUND' }); return; }
    res.json({ success: true, data: course });
  } catch (err) { next(err); }
}

export async function createCourseHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto    = createCourseSchema.parse(req.body);
    const course = await createCourse(dto, req.user!.id);
    res.status(201).json({ success: true, data: course });
  } catch (err) { next(err); }
}

export async function updateCourseHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto    = updateCourseSchema.parse(req.body);
    const course = await updateCourse(req.params.id, dto, req.user!.id);
    res.json({ success: true, data: course });
  } catch (err) { next(err); }
}

export async function exportCoursesHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const csv = await exportCoursesCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="courses-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
}
