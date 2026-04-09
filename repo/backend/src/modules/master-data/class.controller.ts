import { Request, Response, NextFunction } from 'express';
import {
  listClasses, getClassById, createClass, updateClass, exportClassesCsv,
  createClassSchema, updateClassSchema,
} from './class.service';
import {
  csvToXlsxBuffer,
  resolveMasterDataExportFormat,
  XLSX_CONTENT_TYPE,
} from './export-format';

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

export async function exportClassesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
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

    const csv = await exportClassesCsv();
    if (format === 'xlsx') {
      const xlsx = csvToXlsxBuffer(csv);
      res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
      res.setHeader('Content-Disposition', `attachment; filename="classes-${Date.now()}.xlsx"`);
      res.send(xlsx);
      return;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="classes-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
}
