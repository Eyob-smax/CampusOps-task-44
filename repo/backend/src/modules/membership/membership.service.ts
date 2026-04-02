import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export const createTierSchema = z.object({
  name: z.string().min(1).max(80),
  discountPercent: z.number().min(0).max(100).multipleOf(0.01),
  pointThreshold: z.number().int().min(0),
  benefits: z.string().min(1),
  isActive: z.boolean().optional(),
});

export const updateTierSchema = createTierSchema.partial();

function throwNotFound() {
  const err: any = new Error('Membership tier not found');
  err.status = 404;
  err.code = 'TIER_NOT_FOUND';
  throw err;
}

export async function listTiers() {
  return prisma.membershipTier.findMany({ orderBy: { pointThreshold: 'asc' } });
}

export async function getTierById(id: string) {
  const tier = await prisma.membershipTier.findUnique({ where: { id } });
  if (!tier) throwNotFound();
  return tier!;
}

export async function getTierByName(name: string) {
  const tier = await prisma.membershipTier.findFirst({ where: { name } });
  if (!tier) throwNotFound();
  return tier!;
}

export async function createTier(data: z.infer<typeof createTierSchema>) {
  const parsed = createTierSchema.parse(data);
  const createData: Prisma.MembershipTierCreateInput = {
    name: parsed.name,
    discountPercent: parsed.discountPercent,
    pointThreshold: parsed.pointThreshold,
    benefits: parsed.benefits,
    ...(parsed.isActive !== undefined ? { isActive: parsed.isActive } : {}),
  };

  return prisma.membershipTier.create({ data: createData });
}

export async function updateTier(id: string, data: z.infer<typeof updateTierSchema>) {
  await getTierById(id);
  const parsed = updateTierSchema.parse(data);
  const updateData: Prisma.MembershipTierUpdateInput = {
    ...(parsed.name !== undefined ? { name: parsed.name } : {}),
    ...(parsed.discountPercent !== undefined
      ? { discountPercent: parsed.discountPercent }
      : {}),
    ...(parsed.pointThreshold !== undefined
      ? { pointThreshold: parsed.pointThreshold }
      : {}),
    ...(parsed.benefits !== undefined ? { benefits: parsed.benefits } : {}),
    ...(parsed.isActive !== undefined ? { isActive: parsed.isActive } : {}),
  };

  return prisma.membershipTier.update({ where: { id }, data: updateData });
}
