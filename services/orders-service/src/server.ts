import { app } from "./app.js";
import { env } from "./shared/config/env.js";
import { logger } from "./infra/logger.js";
import { startConsumer } from "./events/consumer.js";

const server = app.listen(env.PORT, () => {
  logger.info(`orders-service escuchando en http://localhost:${env.PORT}`);
});

startConsumer().catch((err) => {
  logger.error({ err }, "no se pudo arrancar el consumer de eventos");
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM recibido, cerrando servidor...");
  server.close(() => process.exit(0));
});
