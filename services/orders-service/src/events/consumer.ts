import { randomUUID } from "node:crypto";
import amqp from "amqplib";
import {
  ROUTING_KEYS,
  type OrderCancelledEvent,
  type PaymentConfirmedEvent,
  type PaymentFailedEvent,
  type PaymentRequestedEvent,
  type StockRejectedEvent,
  type StockReservedEvent,
} from "@orderflow/shared";
import { env } from "../shared/config/env.js";
import { logger } from "../infra/logger.js";
import { redis } from "../infra/redis.js";
import { EXCHANGE, publishEvent } from "../infra/rabbitmq.js";
import { OrderAggregate } from "../domain/order.js";
import { ordersRepository } from "../modules/orders/orders.repository.js";

const QUEUE = "orders.saga-events";
const DLQ = "orders.saga-events.dlq";
const MAX_RETRIES = 3;
const PROCESSED_EVENT_TTL_SECONDS = 24 * 60 * 60;
const PAYMENT_SIMULATION_DELAY_MS = 2000;
const PAYMENT_SUCCESS_RATE = 0.8;

/** Un error de estado (transición inválida) no se arregla reintentando. */
class NonRetryableError extends Error {}

export async function startConsumer(): Promise<void> {
  const connection = await amqp.connect(env.RABBITMQ_URL);

  connection.on("error", (err) => {
    logger.error({ err }, "rabbitmq: error en la conexión del consumer");
  });
  connection.on("close", () => {
    logger.error("rabbitmq: conexión del consumer cerrada, terminando el proceso");
    process.exit(1);
  });

  const channel = await connection.createChannel();

  await channel.assertExchange(EXCHANGE, "topic", { durable: true });
  await channel.assertQueue(DLQ, { durable: true });
  await channel.assertQueue(QUEUE, { durable: true });

  for (const key of [
    ROUTING_KEYS.STOCK_RESERVED,
    ROUTING_KEYS.STOCK_REJECTED,
    ROUTING_KEYS.PAYMENT_REQUESTED,
    ROUTING_KEYS.PAYMENT_CONFIRMED,
    ROUTING_KEYS.PAYMENT_FAILED,
  ]) {
    await channel.bindQueue(QUEUE, EXCHANGE, key);
  }

  // Prefetch mas alto que en inventory/notifications: el simulador de pago
  // espera 2s por mensaje, y no queremos que la orden de un cliente bloquee
  // el procesamiento de eventos de otras ordenes durante esa espera.
  await channel.prefetch(5);

  logger.info(`consumer escuchando "${QUEUE}" (stock.*, payment.*)`);

  await channel.consume(QUEUE, (msg) => {
    if (!msg) return;
    void handleMessage(channel, msg);
  });
}

async function handleMessage(channel: amqp.Channel, msg: amqp.ConsumeMessage) {
  const routingKey = msg.fields.routingKey;
  const retryCount = Number(msg.properties.headers?.["x-retry-count"] ?? 0);

  let event: { eventId: string; orderId: string };
  try {
    event = JSON.parse(msg.content.toString());
  } catch (err) {
    logger.error({ err }, "mensaje no es JSON válido, va directo a la DLQ");
    channel.sendToQueue(DLQ, msg.content, { persistent: true });
    channel.ack(msg);
    return;
  }

  const dedupeKey = `processed-events:${event.eventId}`;

  try {
    const alreadyProcessed = await redis.get(dedupeKey);
    if (alreadyProcessed) {
      logger.info({ eventId: event.eventId }, "evento duplicado, se ignora (idempotencia)");
      channel.ack(msg);
      return;
    }

    await dispatch(routingKey, event);

    await redis.set(dedupeKey, "1", "EX", PROCESSED_EVENT_TTL_SECONDS);
    channel.ack(msg);
  } catch (err) {
    if (err instanceof NonRetryableError) {
      logger.error({ err, eventId: event.eventId }, "error no reintentable, va directo a la DLQ");
      channel.sendToQueue(DLQ, msg.content, { persistent: true, headers: msg.properties.headers });
      channel.ack(msg);
      return;
    }

    logger.warn({ err, eventId: event.eventId, retryCount }, "falló al procesar el evento");

    if (retryCount < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, 500 * (retryCount + 1)));
      channel.publish(EXCHANGE, routingKey, msg.content, {
        persistent: true,
        contentType: "application/json",
        headers: { ...msg.properties.headers, "x-retry-count": retryCount + 1 },
      });
      channel.ack(msg);
    } else {
      logger.error({ eventId: event.eventId }, "reintentos agotados, el mensaje va a la DLQ");
      channel.sendToQueue(DLQ, msg.content, { persistent: true, headers: msg.properties.headers });
      channel.ack(msg);
    }
  }
}

async function dispatch(routingKey: string, event: { eventId: string; orderId: string }) {
  switch (routingKey) {
    case ROUTING_KEYS.STOCK_RESERVED:
      return handleStockReserved(event as StockReservedEvent);
    case ROUTING_KEYS.STOCK_REJECTED:
      return handleStockRejected(event as StockRejectedEvent);
    case ROUTING_KEYS.PAYMENT_REQUESTED:
      return simulatePayment(event as PaymentRequestedEvent);
    case ROUTING_KEYS.PAYMENT_CONFIRMED:
      return handlePaymentConfirmed(event as PaymentConfirmedEvent);
    case ROUTING_KEYS.PAYMENT_FAILED:
      return handlePaymentFailed(event as PaymentFailedEvent);
    default:
      logger.warn({ routingKey }, "routing key inesperada, se ignora");
  }
}

async function transition(orderId: string, next: Parameters<OrderAggregate["transitionTo"]>[0]) {
  const record = await ordersRepository.findById(orderId);
  if (!record) {
    // La orden tiene que existir siempre (este servicio la creo antes de
    // publicar order.created) - si no esta, algo esta corrupto, no tiene
    // sentido reintentar.
    throw new NonRetryableError(`Orden ${orderId} no encontrada`);
  }

  const aggregate = OrderAggregate.fromPersisted([], record.status as never);
  try {
    aggregate.transitionTo(next);
  } catch (err) {
    throw new NonRetryableError(err instanceof Error ? err.message : "Transición inválida");
  }

  await ordersRepository.updateStatus(orderId, next);
  return record;
}

async function handleStockReserved(event: StockReservedEvent) {
  const record = await transition(event.orderId, "CONFIRMED");
  logger.info({ orderId: event.orderId }, "orden confirmada (stock reservado)");

  await publishEvent(ROUTING_KEYS.PAYMENT_REQUESTED, {
    eventId: randomUUID(),
    orderId: event.orderId,
    userId: record.userId,
    total: record.total.toString(),
    occurredAt: new Date().toISOString(),
  } satisfies PaymentRequestedEvent);
}

async function handleStockRejected(event: StockRejectedEvent) {
  const record = await transition(event.orderId, "CANCELLED");
  logger.warn({ orderId: event.orderId, reason: event.reason }, "orden cancelada (sin stock)");

  await publishEvent(ROUTING_KEYS.ORDER_CANCELLED, {
    eventId: randomUUID(),
    orderId: event.orderId,
    userId: record.userId,
    reason: event.reason,
    occurredAt: new Date().toISOString(),
  } satisfies OrderCancelledEvent);
}

/**
 * "Mini consumer" de pago simulado: no es un servicio aparte (serían 6
 * servicios, y el roadmap pone un techo de 5) — vive como una reacción más
 * dentro de orders-service, que es quien tiene el contexto del pago.
 */
async function simulatePayment(event: PaymentRequestedEvent) {
  await new Promise((resolve) => setTimeout(resolve, PAYMENT_SIMULATION_DELAY_MS));

  const succeeded = Math.random() < PAYMENT_SUCCESS_RATE;

  if (succeeded) {
    await publishEvent(ROUTING_KEYS.PAYMENT_CONFIRMED, {
      eventId: randomUUID(),
      orderId: event.orderId,
      occurredAt: new Date().toISOString(),
    } satisfies PaymentConfirmedEvent);
  } else {
    await publishEvent(ROUTING_KEYS.PAYMENT_FAILED, {
      eventId: randomUUID(),
      orderId: event.orderId,
      reason: "Pago rechazado (simulado)",
      occurredAt: new Date().toISOString(),
    } satisfies PaymentFailedEvent);
  }
}

async function handlePaymentConfirmed(event: PaymentConfirmedEvent) {
  const record = await transition(event.orderId, "PAID");
  logger.info({ orderId: event.orderId }, "orden pagada");

  await publishEvent(ROUTING_KEYS.ORDER_CONFIRMED, {
    eventId: randomUUID(),
    orderId: event.orderId,
    userId: record.userId,
    occurredAt: new Date().toISOString(),
  });
}

async function handlePaymentFailed(event: PaymentFailedEvent) {
  const record = await transition(event.orderId, "CANCELLED");
  logger.warn({ orderId: event.orderId, reason: event.reason }, "orden cancelada (pago falló)");

  // Compensación: inventory-service consume order.cancelled y libera el
  // stock que había reservado para esta orden.
  await publishEvent(ROUTING_KEYS.ORDER_CANCELLED, {
    eventId: randomUUID(),
    orderId: event.orderId,
    userId: record.userId,
    reason: event.reason,
    occurredAt: new Date().toISOString(),
  } satisfies OrderCancelledEvent);
}
