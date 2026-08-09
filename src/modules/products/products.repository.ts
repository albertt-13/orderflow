import { prisma } from "../../infra/prisma.js";
import type { CreateProductInput, UpdateProductInput } from "./products.schemas.js";

export const productsRepository = {
  create(data: CreateProductInput) {
    return prisma.product.create({ data });
  },

  update(id: string, data: UpdateProductInput) {
    return prisma.product.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.product.delete({ where: { id } });
  },

  findById(id: string) {
    return prisma.product.findUnique({ where: { id } });
  },

  findByIds(ids: string[]) {
    return prisma.product.findMany({ where: { id: { in: ids } } });
  },

  async findMany({ page, limit, name }: { page: number; limit: number; name?: string }) {
    const where = name ? { name: { contains: name, mode: "insensitive" as const } } : {};

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.product.count({ where }),
    ]);

    return { items, total };
  },
};
