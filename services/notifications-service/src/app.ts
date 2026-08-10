import { randomUUID } from "node:crypto";
import express from "express";
import { pinoHttp } from "pino-http";
import { logger } from "./infra/logger.js";
import { errorHandler } from "./shared/middleware/errorHandler.js";
import { notificationsRouter } from "./modules/notifications/notifications.routes.js";

export const app = express();

app.use(pinoHttp({ logger, genReqId: (req) => (req.headers["x-request-id"] as string) || randomUUID() }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "notifications-service" });
});

app.use("/notifications", notificationsRouter);

app.use(errorHandler);
