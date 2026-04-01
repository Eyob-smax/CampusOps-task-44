import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  zoneId: z.string().uuid(),
  tier: z.string().min(1).max(40),
  baseFee: z.number().min(0),
  baseWeightLb: z.number().min(0),
  perLbFee: z.number().min(0),
  maxItems: z.number().int().positive().optional(),
  perItemFee: z.number().min(0).optional(),
  surchargeAk: z.number().min(0).default(0),
  surchargeHi: z.number().min(0).default(0),
  isActive: z.boolean().optional(),
});

export const updateTemplateSchema = createTemplateSchema.partial();

function throwNotFound(msg: string, code: string) {
  const err: any = new Error(msg);
  err.status = 404;
  err.code = code;
  throw err;
}

export async function listTemplates(params?: { zoneId?: string; tier?: string; active?: boolean }) {
  const where: any = {};
  if (params?.zoneId) where.zoneId = params.zoneId;
  if (params?.tier) where.tier = params.tier;
  if (params?.active !== undefined) where.isActive = params.active;
  return prisma.shippingFeeTemplate.findMany({ where, orderBy: { createdAt: 'desc' } });
}

export async function findTemplateForZone(zoneId: string, tier: string) {
  const template = await prisma.shippingFeeTemplate.findFirst({
    where: { zoneId, tier, isActive: true },
  });
  if (!template) throwNotFound('No active shipping template found for zone/tier', 'TEMPLATE_NOT_FOUND');
  return template!;
}

export function calculateShippingFeeFromTemplate(
  template: {
    baseFee: any;
    baseWeightLb: any;
    perLbFee: any;
    maxItems?: number | null;
    perItemFee?: any;
    surchargeAk: any;
    surchargeHi: any;
  },
  weightLb: number,
  itemCount: number,
  regionCode: string,
): number {
  let fee = Number(template.baseFee);
  const baseWeightLb = Number(template.baseWeightLb);
  const perLbFee = Number(template.perLbFee);

  if (weightLb > baseWeightLb) {
    fee += (weightLb - baseWeightLb) * perLbFee;
  }

  if (template.perItemFee != null && itemCount > 0) {
    const perItemFee = Number(template.perItemFee);
    const billableItems = template.maxItems
      ? Math.min(itemCount, template.maxItems)
      : itemCount;
    fee += billableItems * perItemFee;
  }

  if (regionCode === 'AK') fee += Number(template.surchargeAk);
  if (regionCode === 'HI') fee += Number(template.surchargeHi);

  return Math.round(fee * 100) / 100;
}

export async function calculateShippingFee(
  templateId: string,
  weightLb: number,
  itemCount: number,
  regionCode: string,
): Promise<number> {
  const template = await prisma.shippingFeeTemplate.findUnique({ where: { id: templateId } });
  if (!template) throwNotFound('Shipping template not found', 'TEMPLATE_NOT_FOUND');
  return calculateShippingFeeFromTemplate(template!, weightLb, itemCount, regionCode);
}

export async function createTemplate(data: z.infer<typeof createTemplateSchema>) {
  const parsed = createTemplateSchema.parse(data);

  const createData: Prisma.ShippingFeeTemplateCreateInput = {
    name: parsed.name,
    tier: parsed.tier,
    baseFee: parsed.baseFee,
    baseWeightLb: parsed.baseWeightLb,
    perLbFee: parsed.perLbFee,
    maxItems: parsed.maxItems,
    perItemFee: parsed.perItemFee,
    surchargeAk: parsed.surchargeAk,
    surchargeHi: parsed.surchargeHi,
    isActive: parsed.isActive ?? true,
    zone: {
      connect: { id: parsed.zoneId },
    },
  };

  return prisma.shippingFeeTemplate.create({ data: createData });
}

export async function updateTemplate(id: string, data: z.infer<typeof updateTemplateSchema>) {
  const existing = await prisma.shippingFeeTemplate.findUnique({ where: { id } });
  if (!existing) throwNotFound('Shipping template not found', 'TEMPLATE_NOT_FOUND');

  const parsed = updateTemplateSchema.parse(data);
  const updateData: Prisma.ShippingFeeTemplateUpdateInput = {};

  if (parsed.name !== undefined) updateData.name = parsed.name;
  if (parsed.tier !== undefined) updateData.tier = parsed.tier;
  if (parsed.baseFee !== undefined) updateData.baseFee = parsed.baseFee;
  if (parsed.baseWeightLb !== undefined) updateData.baseWeightLb = parsed.baseWeightLb;
  if (parsed.perLbFee !== undefined) updateData.perLbFee = parsed.perLbFee;
  if (parsed.maxItems !== undefined) updateData.maxItems = parsed.maxItems;
  if (parsed.perItemFee !== undefined) updateData.perItemFee = parsed.perItemFee;
  if (parsed.surchargeAk !== undefined) updateData.surchargeAk = parsed.surchargeAk;
  if (parsed.surchargeHi !== undefined) updateData.surchargeHi = parsed.surchargeHi;
  if (parsed.isActive !== undefined) updateData.isActive = parsed.isActive;

  if (parsed.zoneId !== undefined) {
    updateData.zone = { connect: { id: parsed.zoneId } };
  }

  return prisma.shippingFeeTemplate.update({ where: { id }, data: updateData });
}

export async function getTemplateById(id: string) {
  const template = await prisma.shippingFeeTemplate.findUnique({ where: { id } });
  if (!template) throwNotFound('Shipping template not found', 'TEMPLATE_NOT_FOUND');
  return template;
}
