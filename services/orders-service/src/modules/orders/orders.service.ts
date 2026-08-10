import { randomUUID } from "node:crypto";
import { ConflictError, Money, NotFoundError, ROUTING_KEYS } from "@orderflow/shared";
import type { OrderCreatedEvent } from "@orderflow/shared";
import { getProductsByIds } from "../../infra/inventoryClient.js";
import { publishEvent } from "../../infra/rabbitmq.js";
import { OrderAggregate, type OrderStatus } from "../../domain/order.js";
import { ordersRepository } from "./orders.repository.js";
import type { CreateOrderInput } from "./orders.schemas.js";

export const ordersService = {
  async create(userId: string, input: CreateOrderInput) {
    const products = await getProductsByIds(input.items.map((item) => item.productId));
    const productMap = new Map(products.map((p) => [p.id, p]));

    const lines = input.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new NotFoundError(`Producto ${item.productId} no encontrado`);
      }
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: Money.fromDecimalString(product.price),
      };
    });

    const order = OrderAggregate.create(lines);

    const created = await ordersRepository.create({
      userId,
      total: order.total.toDecimalString(),
      items: lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: line.unitPrice.toDecimalString(),
      })),
    });

    const event: OrderCreatedEvent = {
      eventId: randomUUID(),
      orderId: created.id,
      userId,
      items: input.items,
      total: created.total.toString(),
      occurredAt: new Date().toISOString(),
    };
    void publishEvent(ROUTING_KEYS.ORDER_CREATED, event);

    return created;
  },

  async getById(orderId: string) {
    const order = await ordersRepository.findById(orderId);
    if (!order) {
      throw new NotFoundError("Orden no encontrada");
    }
    return order;
  },

  listForUser(userId: string) {
    return ordersRepository.findByUser(userId);
  },

  /** Transición manual (ej. admin marca SHIPPED) — la saga maneja el resto sola. */
  async advanceStatus(orderId: string, nextStatus: OrderStatus) {
    const record = await ordersRepository.findById(orderId);
    if (!record) {
      throw new NotFoundError("Orden no encontrada");
    }

    const aggregate = OrderAggregate.fromPersisted([], record.status as OrderStatus);

    try {
      aggregate.transitionTo(nextStatus);
    } catch (err) {
      throw new ConflictError(err instanceof Error ? err.message : "Transición inválida");
    }

    return ordersRepository.updateStatus(orderId, nextStatus);
  },
};
