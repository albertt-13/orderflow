import { app } from "./app.js";
import { env } from "./shared/config/env.js";
import { logger } from "./infra/logger.js";

const server = app.listen(env.PORT, () => {
  logger.info(`auth-service escuchando en http://localhost:${env.PORT}`);
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM recibido, cerrando servidor...");
  server.close(() => process.exit(0));
});
