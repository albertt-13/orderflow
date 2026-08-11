import { randomUUID } from "node:crypto";
import express from "express";
import { pinoHttp } from "pino-http";
import { createMetrics, requireInternalSecret, runHealthChecks } from "@orderflow/shared";
import { logger } from "./infra/logger.js";
import { prisma } from "./infra/prisma.js";
import { redis } from "./infra/redis.js";
import { getChannel } from "./infra/rabbitmq.js";
import { errorHandler } from "./shared/middleware/errorHandler.js";
import { ordersRouter } from "./modules/orders/orders.routes.js";
import { env } from "./shared/config/env.js";

export const app = express();

const { metricsMiddleware, metricsHandler } = createMetrics("orders-service");

app.use(pinoHttp({ logger, genReqId: (req) => (req.headers["x-request-id"] as string) || randomUUID() }));
app.use(metricsMiddleware);
app.use(express.json());

app.get("/metrics", metricsHandler);

app.get("/health", async (_req, res) => {
  const { status, dependencies } = await runHealthChecks({
    postgres: () => prisma.$queryRaw`SELECT 1`,
    redis: () => redis.ping(),
    rabbitmq: () => getChannel(),
    // No es "propia" en sentido estricto, pero orders-service depende de
    // ella para poder crear ordenes nuevas (ver mini-ADR en el README) -
    // vale la pena que el health lo refleje.
    "inventory-service": async () => {
      const response = await fetch(`${env.INVENTORY_SERVICE_URL}/health`);
      if (!response.ok) throw new Error(`inventory-service respondió ${response.status}`);
    },
  });
  res.status(status === "ok" ? 200 : 503).json({ status, service: "orders-service", dependencies });
});

app.use(requireInternalSecret(env.INTERNAL_SERVICE_SECRET));

app.use("/orders", ordersRouter);

app.use(errorHandler);
