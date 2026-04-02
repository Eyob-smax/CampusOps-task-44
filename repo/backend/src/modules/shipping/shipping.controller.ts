import { Request, Response, NextFunction } from 'express';
import {
  listTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  calculateShippingFee,
  findTemplateForZone,
  createTemplateSchema,
  updateTemplateSchema,
} from './shipping.service';
import { z } from 'zod';

const calculateSchema = z.object({
  templateId: z.string().uuid().optional(),
  zoneId: z.string().uuid().optional(),
  tier: z.string().optional(),
  weightLb: z.number().min(0),
  itemCount: z.number().int().min(0),
  regionCode: z.string().min(2).max(5),
});

export async function getTemplates(req: Request, res: Response, next: NextFunction) {
  try {
    const { zoneId, tier, active } = req.query;
    res.json(await listTemplates({
      zoneId: zoneId as string | undefined,
      tier: tier as string | undefined,
      active: active !== undefined ? active === 'true' : undefined,
    }));
  } catch (err) { next(err); }
}

export async function getTemplate(req: Request, res: Response, next: NextFunction) {
  try { res.json(await getTemplateById(req.params.id)); } catch (err) { next(err); }
}

export async function createTemplateHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createTemplateSchema.parse(req.body);
    res.status(201).json(await createTemplate(body));
  } catch (err) { next(err); }
}

export async function updateTemplateHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = updateTemplateSchema.parse(req.body);
    res.json(await updateTemplate(req.params.id, body));
  } catch (err) { next(err); }
}

export async function calculateFeeHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = calculateSchema.parse(req.body);
    let templateId = body.templateId;
    if (!templateId) {
      if (!body.zoneId || !body.tier) {
        const err: any = new Error('templateId or (zoneId + tier) required');
        err.status = 400;
        throw err;
      }
      const template = await findTemplateForZone(body.zoneId, body.tier);
      templateId = template.id;
    }
    const fee = await calculateShippingFee(templateId, body.weightLb, body.itemCount, body.regionCode);
    res.json({ fee });
  } catch (err) { next(err); }
}
