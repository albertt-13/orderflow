import { app } from "./app.js";
import { env } from "./shared/config/env.js";
import { logger } from "./shared/logger/index.js";

const server = app.listen(env.PORT, () => {
  logger.info(`orderflow escuchando en http://localhost:${env.PORT}`);
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM recibido, cerrando servidor...");
  server.close(() => process.exit(0));
});
