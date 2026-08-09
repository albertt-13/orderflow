import amqp, { type Channel, type ChannelModel } from "amqplib";
import { env } from "../shared/config/env.js";
import { logger } from "../shared/logger/index.js";

export const EXCHANGE = "orderflow.events";

let connection: ChannelModel | null = null;
let channel: Channel | null = null;
let connecting: Promise<Channel> | null = null;

async function connect(): Promise<Channel> {
  connection = await amqp.connect(env.RABBITMQ_URL);

  connection.on("error", (err) => {
    logger.warn({ err }, "rabbitmq: error de conexión");
  });

  connection.on("close", () => {
    logger.warn("rabbitmq: conexión cerrada, reintentando en 2s");
    channel = null;
    connection = null;
    connecting = null;
    setTimeout(() => {
      getChannel().catch((err) => logger.warn({ err }, "rabbitmq: falló el reintento de conexión"));
    }, 2000);
  });

  const ch = await connection.createChannel();
  await ch.assertExchange(EXCHANGE, "topic", { durable: true });
  channel = ch;
  logger.info("rabbitmq: conectado");
  return ch;
}

export function getChannel(): Promise<Channel> {
  if (channel) return Promise.resolve(channel);
  if (!connecting) {
    connecting = connect().catch((err) => {
      connecting = null;
      throw err;
    });
  }
  return connecting;
}

/**
 * Publish best-effort: si RabbitMQ no está disponible, se loguea y sigue -
 * no debe romper la request que lo dispara (crear una orden no debería
 * fallar porque el sistema de notificaciones esté caído). El costo real de
 * esto: si el publish falla, el evento se pierde sin más — el outbox
 * pattern (guardar el evento en la misma transacción de Postgres y
 * publicarlo aparte con reintentos) es la forma correcta de no perder
 * eventos, mencionado como mejora pendiente en el README.
 */
export async function publishEvent(routingKey: string, payload: unknown): Promise<void> {
  try {
    const ch = await getChannel();
    ch.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(payload)), {
      persistent: true,
      contentType: "application/json",
    });
  } catch (err) {
    logger.warn({ err, routingKey }, "no se pudo publicar el evento (RabbitMQ no disponible)");
  }
}
