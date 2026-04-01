import { z } from 'zod';
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
  return prisma.membershipTier.create({ data });
}

export async function updateTier(id: string, data: z.infer<typeof updateTierSchema>) {
  await getTierById(id);
  return prisma.membershipTier.update({ where: { id }, data });
}
