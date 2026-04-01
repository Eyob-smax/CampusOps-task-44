import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export const createWarehouseSchema = z.object({
  name: z.string().min(1).max(120),
  address: z.string().min(1).max(500),
});

export const updateWarehouseSchema = createWarehouseSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export async function listWarehouses() {
  return prisma.warehouse.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getWarehouseById(id: string) {
  const warehouse = await prisma.warehouse.findUnique({ where: { id } });
  if (!warehouse) {
    const err: any = new Error("Warehouse not found");
    err.status = 404;
    err.code = "WAREHOUSE_NOT_FOUND";
    throw err;
  }
  return warehouse;
}

export async function createWarehouse(
  data: z.infer<typeof createWarehouseSchema>,
) {
  const payload = createWarehouseSchema.parse(data);
  const createData: Prisma.WarehouseUncheckedCreateInput = {
    name: payload.name,
    address: payload.address,
  };

  return prisma.warehouse.create({ data: createData });
}

export async function updateWarehouse(
  id: string,
  data: z.infer<typeof updateWarehouseSchema>,
) {
  await getWarehouseById(id);
  const payload = updateWarehouseSchema.parse(data);
  const updateData: Prisma.WarehouseUncheckedUpdateInput = {
    ...(payload.name !== undefined ? { name: payload.name } : {}),
    ...(payload.address !== undefined ? { address: payload.address } : {}),
    ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
  };

  return prisma.warehouse.update({ where: { id }, data: updateData });
}
