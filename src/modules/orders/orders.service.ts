import { Prisma } from "../../generated/prisma/client.js";
import { ConflictError, NotFoundError } from "../../shared/errors/AppError.js";
import { ordersRepository } from "./orders.repository.js";
import type { CreateOrderInput, UpdateOrderStatusInput } from "./orders.schemas.js";

type OrderStatus = UpdateOrderStatusInput["status"];

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["PAID", "CANCELLED"],
  PAID: ["SHIPPED", "CANCELLED"],
  SHIPPED: [],
  CANCELLED: [],
};

export const ordersService = {
  async create(userId: string, input: CreateOrderInput) {
    return ordersRepository.runInTransaction(async (tx) => {
      let total = new Prisma.Decimal(0);
      const itemsToCreate = [];

      for (const item of input.items) {
        // Bloquea la fila del producto (SELECT ... FOR UPDATE) antes de leer
        // su stock, para que dos ordenes concurrentes por el mismo producto
        // no pisen el chequeo de stock una de la otra.
        const locked = await ordersRepository.lockProductForUpdate(tx, item.productId);
        if (!locked) {
          throw new NotFoundError(`Producto ${item.productId} no encontrado`);
        }
        if (locked.stock < item.quantity) {
          throw new ConflictError(`Sin stock suficiente para el producto ${item.productId}`);
        }

        const product = await ordersRepository.findProductById(tx, item.productId);
        if (!product) {
          throw new NotFoundError(`Producto ${item.productId} no encontrado`);
        }

        await ordersRepository.decrementStock(tx, item.productId, item.quantity);

        const unitPrice = product.price;
        total = total.plus(unitPrice.times(item.quantity));
        itemsToCreate.push({ productId: item.productId, quantity: item.quantity, unitPrice });
      }

      return ordersRepository.createOrder(tx, { userId, total, items: itemsToCreate });
    });
  },

  listForUser(userId: string) {
    return ordersRepository.findByUser(userId);
  },

  async advanceStatus(orderId: string, nextStatus: OrderStatus) {
    const order = await ordersRepository.findById(orderId);
    if (!order) {
      throw new NotFoundError("Orden no encontrada");
    }

    const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw new ConflictError(`No se puede pasar de ${order.status} a ${nextStatus}`);
    }

    return ordersRepository.updateStatus(orderId, nextStatus);
  },
};
