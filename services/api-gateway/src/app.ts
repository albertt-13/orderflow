import { randomUUID } from "node:crypto";
import express from "express";
import { pinoHttp } from "pino-http";
import { logger } from "./infra/logger.js";
import { env } from "./shared/config/env.js";
import { requestId } from "./middleware/requestId.js";
import { forwardAuthHeaders } from "./middleware/forwardAuthHeaders.js";
import { loginRateLimiter } from "./middleware/loginRateLimiter.js";
import { authProxy, inventoryProxy, notificationsProxy, ordersProxy } from "./proxies.js";

export const app = express();

app.use(requestId);
app.use(pinoHttp({ logger, genReqId: (req) => (req.headers["x-request-id"] as string) || randomUUID() }));
app.use(forwardAuthHeaders);

app.get("/health", async (_req, res) => {
  const services = {
    "auth-service": env.AUTH_SERVICE_URL,
    "inventory-service": env.INVENTORY_SERVICE_URL,
    "orders-service": env.ORDERS_SERVICE_URL,
    "notifications-service": env.NOTIFICATIONS_SERVICE_URL,
  };

  const checks = await Promise.all(
    Object.entries(services).map(async ([name, url]) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const response = await fetch(`${url}/health`, { signal: controller.signal });
        clearTimeout(timeout);
        return [name, response.ok] as const;
      } catch {
        return [name, false] as const;
      }
    }),
  );

  const status = Object.fromEntries(checks);
  const allOk = checks.every(([, ok]) => ok);
  res.status(allOk ? 200 : 503).json({ status: allOk ? "ok" : "degraded", services: status });
});

// El body NO se parsea acá — http-proxy-middleware necesita el stream de la
// request intacto para reenviarlo. Si se consumiera con express.json() antes
// del proxy, el downstream recibiría un body vacío.
app.post("/auth/login", loginRateLimiter, authProxy);
app.use("/auth", authProxy);
app.use("/products", inventoryProxy);
app.use("/orders", ordersProxy);
app.use("/notifications", notificationsProxy);
