import { prisma } from "../../infra/prisma.js";
import type { OrderStatus } from "../../domain/order.js";

interface OrderItemToCreate {
  productId: string;
  quantity: number;
  unitPrice: string;
}

export const ordersRepository = {
  create(data: { userId: string; total: string; items: OrderItemToCreate[] }) {
    return prisma.order.create({
      data: {
        userId: data.userId,
        total: data.total,
        items: { create: data.items },
      },
      include: { items: true },
    });
  },

  findById(id: string) {
    return prisma.order.findUnique({ where: { id }, include: { items: true } });
  },

  findByUser(userId: string) {
    return prisma.order.findMany({
      where: { userId },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
  },

  updateStatus(id: string, status: OrderStatus) {
    return prisma.order.update({ where: { id }, data: { status } });
  },
};
