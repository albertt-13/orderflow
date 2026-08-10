import { app } from "./app.js";
import { env } from "./shared/config/env.js";
import { logger } from "./infra/logger.js";
import { connectMongo, mongoClient } from "./infra/mongo.js";
import { redis } from "./infra/redis.js";
import { startConsumer } from "./events/consumer.js";

async function main() {
  await connectMongo();

  const server = app.listen(env.PORT, () => {
    logger.info(`notifications-service escuchando en http://localhost:${env.PORT}`);
  });

  await startConsumer();

  process.on("SIGTERM", () => {
    logger.info("SIGTERM recibido: dejando de aceptar requests nuevas...");
    server.close(() => {
      logger.info("server HTTP cerrado, cerrando conexiones...");
      Promise.allSettled([mongoClient.close(), redis.quit()]).then(() => {
        logger.info("listo, chau");
        process.exit(0);
      });
    });
  });
}

main().catch((err) => {
  logger.error({ err }, "notifications-service no pudo arrancar");
  process.exit(1);
});
