import amqp from "amqplib";
import { EXCHANGE, ROUTING_KEYS, type OrderCancelledEvent, type OrderConfirmedEvent } from "@orderflow/shared";
import { env } from "../shared/config/env.js";
import { logger } from "../infra/logger.js";
import { redis } from "../infra/redis.js";
import { notificationsService } from "../modules/notifications/notifications.service.js";

const QUEUE = "notifications.saga-events";
const DLQ = "notifications.saga-events.dlq";
const MAX_RETRIES = 3;
const PROCESSED_EVENT_TTL_SECONDS = 24 * 60 * 60;

let connected = false;

/** Único chequeo de RabbitMQ que tiene sentido acá: este servicio no
 * publica nada, así que "estar sano" es que el consumer esté conectado. */
export function isConsumerConnected(): boolean {
  return connected;
}

export async function startConsumer(): Promise<void> {
  const connection = await amqp.connect(env.RABBITMQ_URL);

  connection.on("error", (err) => {
    logger.error({ err }, "rabbitmq: error en la conexión del consumer");
  });
  connection.on("close", () => {
    connected = false;
    logger.error("rabbitmq: conexión del consumer cerrada, terminando el proceso");
    process.exit(1);
  });

  const channel = await connection.createChannel();

  await channel.assertExchange(EXCHANGE, "topic", { durable: true });
  await channel.assertQueue(DLQ, { durable: true });
  await channel.assertQueue(QUEUE, { durable: true });
  await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEYS.ORDER_CONFIRMED);
  await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEYS.ORDER_CANCELLED);

  await channel.prefetch(1);

  connected = true;
  logger.info(`consumer escuchando "${QUEUE}" (order.confirmed, order.cancelled)`);

  await channel.consume(QUEUE, (msg) => {
    if (!msg) return;
    void handleMessage(channel, msg);
  });
}

async function handleMessage(channel: amqp.Channel, msg: amqp.ConsumeMessage) {
  const routingKey = msg.fields.routingKey;
  const retryCount = Number(msg.properties.headers?.["x-retry-count"] ?? 0);

  let event: { eventId: string; orderId: string; userId: string };
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

    if (routingKey === ROUTING_KEYS.ORDER_CONFIRMED) {
      const confirmed = event as OrderConfirmedEvent;
      await notificationsService.notify({
        eventId: confirmed.eventId,
        orderId: confirmed.orderId,
        userId: confirmed.userId,
        type: "order.confirmed",
      });
    } else if (routingKey === ROUTING_KEYS.ORDER_CANCELLED) {
      const cancelled = event as OrderCancelledEvent;
      await notificationsService.notify({
        eventId: cancelled.eventId,
        orderId: cancelled.orderId,
        userId: cancelled.userId,
        type: "order.cancelled",
        reason: cancelled.reason,
      });
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
