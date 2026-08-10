import amqp, { type Channel, type ChannelModel } from "amqplib";
import { EXCHANGE } from "@orderflow/shared";
import { env } from "../shared/config/env.js";
import { logger } from "./logger.js";

export { EXCHANGE };

let connection: ChannelModel | null = null;
let channel: Channel | null = null;
let connecting: Promise<Channel> | null = null;

async function connect(): Promise<Channel> {
  connection = await amqp.connect(env.RABBITMQ_URL);

  connection.on("error", (err) => logger.warn({ err }, "rabbitmq: error de conexión"));
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
