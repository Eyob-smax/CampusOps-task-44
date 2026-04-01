import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  listIntegrationKeys, createIntegrationKey,
  rotateIntegrationKey, deactivateIntegrationKey,
} from './integration-key.service';

const createSchema = z.object({
  name:  z.string().min(2).max(100).trim(),
  scope: z.enum(['classroom', 'parking', 'carrier']),
});

export async function getKeys(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const keys = await listIntegrationKeys();
    res.status(200).json({ success: true, data: keys });
  } catch (err) { next(err); }
}

export async function createKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, scope } = createSchema.parse(req.body);
    const result = await createIntegrationKey(name, scope, req.user!.id);
    // The raw secret is returned ONCE — display it prominently in UI
    res.status(201).json({
      success: true,
      data: result,
      message: 'Store the secret now — it will not be shown again.',
    });
  } catch (err) { next(err); }
}

export async function rotateKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await rotateIntegrationKey(req.params.id, req.user!.id);
    res.status(200).json({
      success: true,
      data: result,
      message: 'New secret generated. Store it now — it will not be shown again.',
    });
  } catch (err) { next(err); }
}

export async function deactivateKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deactivateIntegrationKey(req.params.id, req.user!.id);
    res.status(200).json({ success: true, message: 'Integration key deactivated' });
  } catch (err) { next(err); }
}
