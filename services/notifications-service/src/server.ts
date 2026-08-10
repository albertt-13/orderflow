import { app } from "./app.js";
import { env } from "./shared/config/env.js";
import { logger } from "./infra/logger.js";
import { connectMongo } from "./infra/mongo.js";
import { startConsumer } from "./events/consumer.js";

async function main() {
  await connectMongo();

  const server = app.listen(env.PORT, () => {
    logger.info(`notifications-service escuchando en http://localhost:${env.PORT}`);
  });

  await startConsumer();

  process.on("SIGTERM", () => {
    logger.info("SIGTERM recibido, cerrando servidor...");
    server.close(() => process.exit(0));
  });
}

main().catch((err) => {
  logger.error({ err }, "notifications-service no pudo arrancar");
  process.exit(1);
});
