import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import { publishEvent } from "../../infra/rabbitmq.js";
import { ConflictError, NotFoundError } from "../../shared/errors/AppError.js";
import { ROUTING_KEYS } from "../../shared/events/contracts.js";
import type { OrderCancelledEvent, OrderCreatedEvent } from "../../shared/events/contracts.js";
import { productsService } from "../products/products.service.js";
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
    const order = await ordersRepository.runInTransaction(async (tx) => {
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

    // Fuera de la transaccion (recien despues del commit): son efectos
    // secundarios (analitica, notificaciones), no algo que deba poder hacer
    // rollback de la orden si fallan.
    for (const item of input.items) {
      void productsService.recordSale(item.productId, item.quantity);
    }

    const event: OrderCreatedEvent = {
      eventId: randomUUID(),
      orderId: order.id,
      userId,
      items: input.items,
      total: order.total.toString(),
      occurredAt: new Date().toISOString(),
    };
    void publishEvent(ROUTING_KEYS.ORDER_CREATED, event);

    return order;
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

    const updated = await ordersRepository.updateStatus(orderId, nextStatus);

    if (nextStatus === "CANCELLED") {
      const event: OrderCancelledEvent = {
        eventId: randomUUID(),
        orderId: updated.id,
        userId: updated.userId,
        occurredAt: new Date().toISOString(),
      };
      void publishEvent(ROUTING_KEYS.ORDER_CANCELLED, event);
    }

    return updated;
  },
};
