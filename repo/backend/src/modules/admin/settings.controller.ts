import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  getAllSettings, updateSettings,
  getAlertThresholds, upsertAlertThreshold,
  getBackupRecords,
} from './settings.service';
import { normalizeThresholdOperator } from '../observability/threshold-operator';

const updateSettingsSchema = z.record(z.string(), z.string());

const thresholdSchema = z.object({
  metricName: z.string().min(1).max(100),
  operator: z.string().transform((value, ctx) => {
    const normalized = normalizeThresholdOperator(value);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'operator must be one of >, <, >=, <=, == (aliases gt/lt/gte/lte/eq are accepted)',
      });
      return z.NEVER;
    }
    return normalized;
  }),
  value:      z.number(),
  isActive:   z.boolean().default(true),
});

export async function getSettings(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = await getAllSettings();
    res.status(200).json({ success: true, data: settings });
  } catch (err) { next(err); }
}

export async function patchSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const updates = updateSettingsSchema.parse(req.body);
    await updateSettings(updates, req.user!.id);
    res.status(200).json({ success: true, message: 'Settings updated' });
  } catch (err) { next(err); }
}

export async function getThresholds(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const thresholds = await getAlertThresholds();
    res.status(200).json({ success: true, data: thresholds });
  } catch (err) { next(err); }
}

export async function upsertThreshold(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = thresholdSchema.parse(req.body);
    const threshold = await upsertAlertThreshold(dto.metricName, dto.operator, dto.value, dto.isActive, req.user!.id);
    res.status(200).json({ success: true, data: threshold });
  } catch (err) { next(err); }
}

export async function getBackups(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const records = await getBackupRecords();
    res.status(200).json({ success: true, data: records });
  } catch (err) { next(err); }
}
