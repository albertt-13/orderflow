import amqp from "amqplib";
import { env } from "./shared/config/env.js";
import { logger } from "./shared/logger/index.js";
import { redis } from "./infra/redis.js";
import { EXCHANGE } from "./infra/rabbitmq.js";

const QUEUE = "orderflow.notifications";
const DLQ = "orderflow.notifications.dlq";
const MAX_RETRIES = 3;
const PROCESSED_EVENT_TTL_SECONDS = 24 * 60 * 60;

interface DomainEvent {
  eventId: string;
  orderId: string;
  [key: string]: unknown;
}

/**
 * Simula el trabajo real del worker (mandar un email). Tiene un caso
 * especial para simular un mensaje "veneno": publicar a mano desde el panel
 * de RabbitMQ (localhost:15672) un mensaje con orderId: "poison" al exchange
 * orderflow.events con routing key order.created, y ver como despues de
 * MAX_RETRIES termina en la DLQ.
 */
function processEvent(routingKey: string, event: DomainEvent): void {
  if (event.orderId === "poison") {
    throw new Error("mensaje veneno: falla a propósito para probar la DLQ");
  }

  if (routingKey === "order.created") {
    logger.info(`📧 Email simulado: orden ${event.orderId} creada (total $${event.total})`);
  } else if (routingKey === "order.cancelled") {
    logger.info(`📧 Email simulado: orden ${event.orderId} cancelada`);
  } else {
    logger.warn(`evento con routing key desconocida: ${routingKey}`);
  }
}

async function main() {
  const connection = await amqp.connect(env.RABBITMQ_URL);
  const channel = await connection.createChannel();

  await channel.assertExchange(EXCHANGE, "topic", { durable: true });
  await channel.assertQueue(DLQ, { durable: true });
  await channel.assertQueue(QUEUE, { durable: true });
  await channel.bindQueue(QUEUE, EXCHANGE, "order.*");

  // Prefetch 1: el worker no toma un mensaje nuevo hasta terminar (ack/nack)
  // el actual. Sin esto, con varios mensajes en vuelo, un crash del worker
  // deja varios sin confirmar a la vez en lugar de uno solo.
  await channel.prefetch(1);

  logger.info(`worker escuchando "${QUEUE}" (binding "order.*")`);

  await channel.consume(QUEUE, (msg) => {
    if (!msg) return;
    void handleMessage(channel, msg);
  });

  connection.on("close", () => {
    logger.warn("worker: conexión a rabbitmq cerrada, el proceso va a terminar");
    process.exit(1);
  });
}

async function handleMessage(channel: amqp.Channel, msg: amqp.ConsumeMessage) {
  const routingKey = msg.fields.routingKey;
  const retryCount = Number(msg.properties.headers?.["x-retry-count"] ?? 0);

  let event: DomainEvent;
  try {
    event = JSON.parse(msg.content.toString()) as DomainEvent;
  } catch (err) {
    logger.error({ err }, "mensaje no es JSON válido, va directo a la DLQ");
    channel.sendToQueue(DLQ, msg.content, { persistent: true });
    channel.ack(msg);
    return;
  }

  const dedupeKey = `processed-events:${event.eventId}`;

  try {
    // Idempotencia: si ya procesamos este eventId, no lo procesamos de
    // nuevo (RabbitMQ es at-least-once: puede entregar el mismo mensaje
    // más de una vez, y evitar el email duplicado es responsabilidad
    // nuestra, no de RabbitMQ). Importante: la marca de "procesado" se
    // escribe DESPUÉS de procesar con éxito, no antes — si se marcara
    // antes, un mensaje que falla y se reintenta se vería a sí mismo como
    // "duplicado" en el reintento y nunca llegaría a la DLQ.
    const alreadyProcessed = await redis.get(dedupeKey);
    if (alreadyProcessed) {
      logger.info({ eventId: event.eventId }, "evento duplicado, se ignora (idempotencia)");
      channel.ack(msg);
      return;
    }

    processEvent(routingKey, event);

    await redis.set(dedupeKey, "1", "EX", PROCESSED_EVENT_TTL_SECONDS);
    channel.ack(msg);
  } catch (err) {
    logger.warn({ err, eventId: event.eventId, retryCount }, "falló al procesar el evento");

    if (retryCount < MAX_RETRIES) {
      // Reintento manual: se sacan estas del mensaje original (ack) y se
      // republica una copia con el contador incrementado. Un delay chico
      // evita un loop demasiado ajustado; una cola de espera con TTL +
      // dead-letter de vuelta a la cola principal sería la mejora real
      // (retry con backoff real, sin bloquear al worker con un timeout).
      await new Promise((resolve) => setTimeout(resolve, 500 * (retryCount + 1)));
      channel.publish(EXCHANGE, routingKey, msg.content, {
        persistent: true,
        contentType: "application/json",
        headers: { ...msg.properties.headers, "x-retry-count": retryCount + 1 },
      });
      channel.ack(msg);
    } else {
      logger.error({ eventId: event.eventId }, "reintentos agotados, el mensaje va a la DLQ");
      channel.sendToQueue(DLQ, msg.content, {
        persistent: true,
        headers: msg.properties.headers,
      });
      channel.ack(msg);
    }
  }
}

main().catch((err) => {
  logger.error({ err }, "el worker no pudo arrancar");
  process.exit(1);
});
