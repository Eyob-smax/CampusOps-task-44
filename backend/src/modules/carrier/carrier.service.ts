import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { encrypt } from '../../lib/encryption';

export const createCarrierSchema = z.object({
  name: z.string().min(1).max(120),
  connectorUrl: z.string().url(),
  apiKey: z.string().min(1),
});

export const updateCarrierSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  connectorUrl: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

function serializeCarrier(carrier: any) {
  const { apiKeyEncrypted, ...rest } = carrier;
  return { ...rest, hasApiKey: apiKeyEncrypted != null };
}

export async function listCarriers() {
  const carriers = await prisma.carrier.findMany({ orderBy: { createdAt: 'desc' } });
  return carriers.map(serializeCarrier);
}

export async function getCarrierById(id: string) {
  const carrier = await prisma.carrier.findUnique({ where: { id } });
  if (!carrier) {
    const err: any = new Error('Carrier not found');
    err.status = 404;
    err.code = 'CARRIER_NOT_FOUND';
    throw err;
  }
  return serializeCarrier(carrier);
}

export async function createCarrier(data: z.infer<typeof createCarrierSchema>) {
  const { apiKey, ...rest } = data;
  const carrier = await prisma.carrier.create({
    data: { ...rest, apiKeyEncrypted: encrypt(apiKey) },
  });
  return serializeCarrier(carrier);
}

export async function updateCarrier(id: string, data: z.infer<typeof updateCarrierSchema>) {
  await getCarrierById(id);
  const { apiKey, ...rest } = data;
  const updateData: any = { ...rest };
  if (apiKey !== undefined) {
    updateData.apiKeyEncrypted = encrypt(apiKey);
  }
  const carrier = await prisma.carrier.update({ where: { id }, data: updateData });
  return serializeCarrier(carrier);
}
