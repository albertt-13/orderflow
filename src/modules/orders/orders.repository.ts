import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../infra/prisma.js";
import type { UpdateOrderStatusInput } from "./orders.schemas.js";

type Db = typeof prisma | Prisma.TransactionClient;

interface OrderItemToCreate {
  productId: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
}

export const ordersRepository = {
  runInTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction(fn);
  },

  /**
   * Bloquea la fila del producto con SELECT ... FOR UPDATE para que dos
   * requests concurrentes comprando el mismo producto no lean el mismo
   * stock "viejo" antes de que la otra termine su transaccion.
   */
  async lockProductForUpdate(tx: Db, productId: string) {
    const rows = await tx.$queryRaw<
      { id: string; stock: number }[]
    >`SELECT id, stock FROM "Product" WHERE id = ${productId} FOR UPDATE`;
    return rows[0] ?? null;
  },

  findProductById(tx: Db, productId: string) {
    return tx.product.findUnique({ where: { id: productId } });
  },

  decrementStock(tx: Db, productId: string, quantity: number) {
    return tx.product.update({
      where: { id: productId },
      data: { stock: { decrement: quantity } },
    });
  },

  createOrder(
    tx: Db,
    data: { userId: string; total: Prisma.Decimal; items: OrderItemToCreate[] },
  ) {
    return tx.order.create({
      data: {
        userId: data.userId,
        total: data.total,
        items: { create: data.items },
      },
      include: { items: true },
    });
  },

  findByUser(userId: string) {
    return prisma.order.findMany({
      where: { userId },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
  },

  findById(orderId: string) {
    return prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
  },

  updateStatus(orderId: string, status: UpdateOrderStatusInput["status"]) {
    return prisma.order.update({ where: { id: orderId }, data: { status } });
  },
};
