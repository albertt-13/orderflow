import { randomUUID } from "node:crypto";
import express from "express";
import { pinoHttp } from "pino-http";
import { runHealthChecks } from "@orderflow/shared";
import { logger } from "./infra/logger.js";
import { pingMongo } from "./infra/mongo.js";
import { redis } from "./infra/redis.js";
import { errorHandler } from "./shared/middleware/errorHandler.js";
import { notificationsRouter } from "./modules/notifications/notifications.routes.js";
import { isConsumerConnected } from "./events/consumer.js";

export const app = express();

app.use(pinoHttp({ logger, genReqId: (req) => (req.headers["x-request-id"] as string) || randomUUID() }));
app.use(express.json());

app.get("/health", async (_req, res) => {
  const { status, dependencies } = await runHealthChecks({
    mongodb: () => pingMongo(),
    redis: () => redis.ping(),
    rabbitmq: () => (isConsumerConnected() ? Promise.resolve() : Promise.reject(new Error("not connected"))),
  });
  res.status(status === "ok" ? 200 : 503).json({ status, service: "notifications-service", dependencies });
});

app.use("/notifications", notificationsRouter);

app.use(errorHandler);
