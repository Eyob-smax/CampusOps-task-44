import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export const createZoneSchema = z.object({
  name: z.string().min(1).max(120),
  regionCode: z.string().min(1).max(10),
  isActive: z.boolean().optional(),
});

export const updateZoneSchema = createZoneSchema.partial();

export const addZipSchema = z.object({
  zipCode: z.string().min(5).max(10),
  isNonServiceable: z.boolean().optional(),
});

function throwNotFound(msg: string, code: string) {
  const err: any = new Error(msg);
  err.status = 404;
  err.code = code;
  throw err;
}

export async function listZones() {
  return prisma.deliveryZone.findMany({
    include: { zipCodes: true, shippingTemplates: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getZoneById(id: string) {
  const zone = await prisma.deliveryZone.findUnique({
    where: { id },
    include: { zipCodes: true, shippingTemplates: true },
  });
  if (!zone) throwNotFound("Delivery zone not found", "ZONE_NOT_FOUND");
  return zone;
}

export async function createZone(data: z.infer<typeof createZoneSchema>) {
  const payload = createZoneSchema.parse(data);
  const createData: Prisma.DeliveryZoneUncheckedCreateInput = {
    name: payload.name,
    regionCode: payload.regionCode,
    isActive: payload.isActive ?? true,
  };

  return prisma.deliveryZone.create({
    data: createData,
    include: { zipCodes: true, shippingTemplates: true },
  });
}

export async function updateZone(
  id: string,
  data: z.infer<typeof updateZoneSchema>,
) {
  await getZoneById(id);
  const payload = updateZoneSchema.parse(data);
  const updateData: Prisma.DeliveryZoneUncheckedUpdateInput = {
    ...(payload.name !== undefined ? { name: payload.name } : {}),
    ...(payload.regionCode !== undefined
      ? { regionCode: payload.regionCode }
      : {}),
    ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
  };

  return prisma.deliveryZone.update({
    where: { id },
    data: updateData,
    include: { zipCodes: true, shippingTemplates: true },
  });
}

export async function addZipCode(
  zoneId: string,
  data: z.infer<typeof addZipSchema>,
) {
  await getZoneById(zoneId);
  return prisma.deliveryZoneZip.upsert({
    where: { zoneId_zipCode: { zoneId, zipCode: data.zipCode } },
    update: { isNonServiceable: data.isNonServiceable ?? false },
    create: {
      zoneId,
      zipCode: data.zipCode,
      isNonServiceable: data.isNonServiceable ?? false,
    },
  });
}

export async function removeZipCode(zoneId: string, zipCode: string) {
  await getZoneById(zoneId);
  const existing = await prisma.deliveryZoneZip.findUnique({
    where: { zoneId_zipCode: { zoneId, zipCode } },
  });
  if (!existing) throwNotFound("ZIP code not found in zone", "ZIP_NOT_FOUND");
  await prisma.deliveryZoneZip.delete({
    where: { zoneId_zipCode: { zoneId, zipCode } },
  });
  return { deleted: true };
}

export async function setZipNonServiceable(
  zoneId: string,
  zipCode: string,
  isNonServiceable: boolean,
) {
  await getZoneById(zoneId);
  return prisma.deliveryZoneZip.update({
    where: { zoneId_zipCode: { zoneId, zipCode } },
    data: { isNonServiceable },
  });
}

export async function checkZipServiceability(zipCode: string) {
  const zipEntry = await prisma.deliveryZoneZip.findFirst({
    where: { zipCode },
    include: { zone: true },
  });

  if (!zipEntry) {
    const err: any = new Error("ZIP code not found in any delivery zone");
    err.status = 404;
    err.code = "ZIP_NOT_IN_ANY_ZONE";
    throw err;
  }

  if (zipEntry.isNonServiceable) {
    const err: any = new Error("ZIP code is in a non-serviceable area");
    err.status = 422;
    err.code = "NON_SERVICEABLE_ZIP";
    throw err;
  }

  return { serviceable: true, zone: zipEntry.zone, zipEntry };
}
