import { Request, Response, NextFunction } from 'express';
import {
  listDepartments, getDepartmentById, createDepartment,
  updateDepartment, deactivateDepartment, exportDepartmentsCsv,
  createDepartmentSchema, updateDepartmentSchema,
} from './department.service';
import {
  csvToXlsxBuffer,
  resolveMasterDataExportFormat,
  XLSX_CONTENT_TYPE,
} from './export-format';

export async function getDepartments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const activeOnly = req.query['active'] === 'true';
    const data = await listDepartments(activeOnly);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getDepartment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dept = await getDepartmentById(req.params.id);
    if (!dept) { res.status(404).json({ success: false, error: 'Department not found', code: 'NOT_FOUND' }); return; }
    res.json({ success: true, data: dept });
  } catch (err) { next(err); }
}

export async function createDepartmentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto  = createDepartmentSchema.parse(req.body);
    const dept = await createDepartment(dto, req.user!.id);
    res.status(201).json({ success: true, data: dept });
  } catch (err) { next(err); }
}

export async function updateDepartmentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto  = updateDepartmentSchema.parse(req.body);
    const dept = await updateDepartment(req.params.id, dto, req.user!.id);
    res.json({ success: true, data: dept });
  } catch (err) { next(err); }
}

export async function deactivateDepartmentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deactivateDepartment(req.params.id, req.user!.id);
    res.json({ success: true, message: 'Department deactivated' });
  } catch (err) { next(err); }
}

export async function exportDepartmentsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
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

    const csv = await exportDepartmentsCsv();
    if (format === 'xlsx') {
      const xlsx = csvToXlsxBuffer(csv);
      res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
      res.setHeader('Content-Disposition', `attachment; filename="departments-${Date.now()}.xlsx"`);
      res.send(xlsx);
      return;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="departments-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
}
