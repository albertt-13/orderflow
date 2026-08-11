import { randomUUID } from "node:crypto";
import express from "express";
import { pinoHttp } from "pino-http";
import { createMetrics, requireInternalSecret, runHealthChecks } from "@orderflow/shared";
import { logger } from "./infra/logger.js";
import { prisma } from "./infra/prisma.js";
import { redis } from "./infra/redis.js";
import { getChannel } from "./infra/rabbitmq.js";
import { errorHandler } from "./shared/middleware/errorHandler.js";
import { productsRouter } from "./modules/products/products.routes.js";
import { env } from "./shared/config/env.js";

export const app = express();

const { metricsMiddleware, metricsHandler } = createMetrics("inventory-service");

app.use(pinoHttp({ logger, genReqId: (req) => (req.headers["x-request-id"] as string) || randomUUID() }));
app.use(metricsMiddleware);
app.use(express.json());

app.get("/metrics", metricsHandler);

app.get("/health", async (_req, res) => {
  const { status, dependencies } = await runHealthChecks({
    postgres: () => prisma.$queryRaw`SELECT 1`,
    redis: () => redis.ping(),
    // getChannel() conecta si todavia no lo hizo (el publisher es lazy) -
    // asi el health check no da falso negativo antes del primer publish.
    rabbitmq: () => getChannel(),
  });
  res.status(status === "ok" ? 200 : 503).json({ status, service: "inventory-service", dependencies });
});

app.use(requireInternalSecret(env.INTERNAL_SERVICE_SECRET));

app.use("/products", productsRouter);

app.use(errorHandler);
