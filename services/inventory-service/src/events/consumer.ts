import amqp from "amqplib";
import { ROUTING_KEYS, type OrderCancelledEvent, type OrderCreatedEvent } from "@orderflow/shared";
import { env } from "../shared/config/env.js";
import { logger } from "../infra/logger.js";
import { redis } from "../infra/redis.js";
import { EXCHANGE, publishEvent } from "../infra/rabbitmq.js";
import { reservationService } from "../modules/stock/reservation.service.js";

const QUEUE = "inventory.saga-events";
const DLQ = "inventory.saga-events.dlq";
const MAX_RETRIES = 3;
const PROCESSED_EVENT_TTL_SECONDS = 24 * 60 * 60;

export async function startConsumer(): Promise<void> {
  const connection = await amqp.connect(env.RABBITMQ_URL);

  // Sin este listener, un error de conexion (ej. timeout de heartbeat si el
  // proceso queda bloqueado un rato) tira una excepcion no capturada y
  // crashea TODO el servicio, no solo el consumer. Se prefiere morir
  // explicitamente en el close (para que se note y se reinicie) en vez de
  // quedar con un consumer muerto pero el HTTP server respondiendo "sano".
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
  await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEYS.ORDER_CREATED);
  await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEYS.ORDER_CANCELLED);

  await channel.prefetch(1);

  logger.info(`consumer escuchando "${QUEUE}" (order.created, order.cancelled)`);

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

    if (routingKey === ROUTING_KEYS.ORDER_CREATED) {
      await handleOrderCreated(event as unknown as OrderCreatedEvent);
    } else if (routingKey === ROUTING_KEYS.ORDER_CANCELLED) {
      await handleOrderCancelled(event as unknown as OrderCancelledEvent);
    } else {
      logger.warn({ routingKey }, "routing key inesperada, se ignora");
    }

    await redis.set(dedupeKey, "1", "EX", PROCESSED_EVENT_TTL_SECONDS);
    channel.ack(msg);
  } catch (err) {
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

async function handleOrderCreated(event: OrderCreatedEvent) {
  const result = await reservationService.reserve(event.orderId, event.items);

  if (result.ok) {
    logger.info({ orderId: event.orderId }, "stock reservado");
    await publishEvent(ROUTING_KEYS.STOCK_RESERVED, {
      eventId: crypto.randomUUID(),
      orderId: event.orderId,
      occurredAt: new Date().toISOString(),
    });
  } else {
    logger.warn({ orderId: event.orderId, reason: result.reason }, "stock rechazado");
    await publishEvent(ROUTING_KEYS.STOCK_REJECTED, {
      eventId: crypto.randomUUID(),
      orderId: event.orderId,
      reason: result.reason,
      occurredAt: new Date().toISOString(),
    });
  }
}

async function handleOrderCancelled(event: OrderCancelledEvent) {
  await reservationService.release(event.orderId);
  logger.info({ orderId: event.orderId }, "stock liberado (compensación)");
}
