import { Request, Response, NextFunction } from 'express';
import {
  listClasses, getClassById, createClass, updateClass, exportClassesCsv,
  createClassSchema, updateClassSchema,
} from './class.service';

export async function getClasses(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters = {
      semesterId:   req.query['semesterId']   as string | undefined,
      departmentId: req.query['departmentId'] as string | undefined,
      activeOnly:   req.query['active']       === 'true',
    };
    const data = await listClasses(filters);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getClass(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cls = await getClassById(req.params.id);
    if (!cls) { res.status(404).json({ success: false, error: 'Class not found', code: 'NOT_FOUND' }); return; }
    res.json({ success: true, data: cls });
  } catch (err) { next(err); }
}

export async function createClassHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = createClassSchema.parse(req.body);
    const cls = await createClass(dto, req.user!.id);
    res.status(201).json({ success: true, data: cls });
  } catch (err) { next(err); }
}

export async function updateClassHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = updateClassSchema.parse(req.body);
    const cls = await updateClass(req.params.id, dto, req.user!.id);
    res.json({ success: true, data: cls });
  } catch (err) { next(err); }
}

export async function exportClassesHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const csv = await exportClassesCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="classes-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
}
