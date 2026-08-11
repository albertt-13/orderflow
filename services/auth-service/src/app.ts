import { randomUUID } from "node:crypto";
import express from "express";
import { pinoHttp } from "pino-http";
import { createMetrics, requireInternalSecret, runHealthChecks } from "@orderflow/shared";
import { logger } from "./infra/logger.js";
import { prisma } from "./infra/prisma.js";
import { redis } from "./infra/redis.js";
import { errorHandler } from "./shared/middleware/errorHandler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { env } from "./shared/config/env.js";

export const app = express();

const { metricsMiddleware, metricsHandler } = createMetrics("auth-service");

app.use(pinoHttp({ logger, genReqId: (req) => (req.headers["x-request-id"] as string) || randomUUID() }));
app.use(metricsMiddleware);
app.use(express.json());

app.get("/metrics", metricsHandler);

app.get("/health", async (_req, res) => {
  const { status, dependencies } = await runHealthChecks({
    postgres: () => prisma.$queryRaw`SELECT 1`,
    redis: () => redis.ping(),
  });
  res.status(status === "ok" ? 200 : 503).json({ status, service: "auth-service", dependencies });
});

app.use(requireInternalSecret(env.INTERNAL_SERVICE_SECRET));

app.use("/auth", authRouter);

app.use(errorHandler);
