import { Request, Response, NextFunction } from 'express';
import {
  listWarehouses,
  getWarehouseById,
  createWarehouse,
  updateWarehouse,
  createWarehouseSchema,
  updateWarehouseSchema,
} from './warehouse.service';

export async function getWarehouses(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listWarehouses();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getWarehouse(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getWarehouseById(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createWarehouseHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createWarehouseSchema.parse(req.body);
    const data = await createWarehouse(body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateWarehouseHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = updateWarehouseSchema.parse(req.body);
    const data = await updateWarehouse(req.params.id, body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}
