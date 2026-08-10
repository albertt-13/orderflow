import { randomUUID } from "node:crypto";
import express from "express";
import { pinoHttp } from "pino-http";
import { logger } from "./infra/logger.js";
import { errorHandler } from "./shared/middleware/errorHandler.js";
import { ordersRouter } from "./modules/orders/orders.routes.js";

export const app = express();

app.use(pinoHttp({ logger, genReqId: (req) => (req.headers["x-request-id"] as string) || randomUUID() }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "orders-service" });
});

app.use("/orders", ordersRouter);

app.use(errorHandler);
