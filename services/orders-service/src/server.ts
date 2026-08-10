import { app } from "./app.js";
import { env } from "./shared/config/env.js";
import { logger } from "./infra/logger.js";
import { prisma } from "./infra/prisma.js";
import { redis } from "./infra/redis.js";
import { closePublisherConnection } from "./infra/rabbitmq.js";
import { startConsumer } from "./events/consumer.js";

const server = app.listen(env.PORT, () => {
  logger.info(`orders-service escuchando en http://localhost:${env.PORT}`);
});

startConsumer().catch((err) => {
  logger.error({ err }, "no se pudo arrancar el consumer de eventos");
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM recibido: dejando de aceptar requests nuevas...");
  server.close(() => {
    logger.info("server HTTP cerrado, cerrando conexiones...");
    Promise.allSettled([prisma.$disconnect(), redis.quit(), closePublisherConnection()]).then(() => {
      logger.info("listo, chau");
      process.exit(0);
    });
  });
});
