import { z } from 'zod';
import { Prisma } from '@prisma/client';
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
  const payload = createCarrierSchema.parse(data);
  const createData: Prisma.CarrierUncheckedCreateInput = {
    name: payload.name,
    connectorUrl: payload.connectorUrl,
    apiKeyEncrypted: encrypt(payload.apiKey),
  };

  const carrier = await prisma.carrier.create({
    data: createData,
  });
  return serializeCarrier(carrier);
}

export async function updateCarrier(id: string, data: z.infer<typeof updateCarrierSchema>) {
  await getCarrierById(id);
  const payload = updateCarrierSchema.parse(data);
  const updateData: Prisma.CarrierUncheckedUpdateInput = {
    ...(payload.name !== undefined ? { name: payload.name } : {}),
    ...(payload.connectorUrl !== undefined ? { connectorUrl: payload.connectorUrl } : {}),
    ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
    ...(payload.apiKey !== undefined ? { apiKeyEncrypted: encrypt(payload.apiKey) } : {}),
  };

  const carrier = await prisma.carrier.update({ where: { id }, data: updateData });
  return serializeCarrier(carrier);
}
