import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { createMetrics, runHealthChecks } from "@orderflow/shared";
import { logger } from "./infra/logger.js";
import { env } from "./shared/config/env.js";
import { requestId } from "./middleware/requestId.js";
import { forwardAuthHeaders } from "./middleware/forwardAuthHeaders.js";
import { loginRateLimiter } from "./middleware/loginRateLimiter.js";
import { authProxy, inventoryProxy, notificationsProxy, ordersProxy } from "./proxies.js";

export const app = express();

const { metricsMiddleware, metricsHandler } = createMetrics("api-gateway");

app.use(requestId);
app.use(pinoHttp({ logger, genReqId: (req) => (req.headers["x-request-id"] as string) || randomUUID() }));
app.use(metricsMiddleware);
app.use(helmet());
// Whitelist explicita (CORS_ORIGINS): sin origenes configurados, ningun
// browser puede llamar cross-origin — curl/Bruno/servidor-a-servidor no
// pasan por CORS, así que esto no afecta esos casos.
app.use(cors({ origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false }));
app.use(forwardAuthHeaders);

app.get("/metrics", metricsHandler);

// Liveness real: "¿el proceso está vivo?", sin tocar servicios externos.
// Es a propósito distinto de /health de abajo — Render usa ESTE endpoint
// para decidir si reinicia el contenedor. Si usara /health (que depende de
// los otros 4 servicios), un solo servicio dormido tumbaría también al
// gateway sano: Render vería el 503 agregado y lo mataría igual, aunque el
// gateway en sí nunca dejó de responder. Bug real encontrado en producción
// (free tier de Render, cada servicio duerme por separado tras inactividad).
app.get("/live", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/health", async (_req, res) => {
  const services = {
    "auth-service": env.AUTH_SERVICE_URL,
    "inventory-service": env.INVENTORY_SERVICE_URL,
    "orders-service": env.ORDERS_SERVICE_URL,
    "notifications-service": env.NOTIFICATIONS_SERVICE_URL,
  };

  const { status, dependencies } = await runHealthChecks(
    Object.fromEntries(
      Object.entries(services).map(([name, url]) => [
        name,
        async () => {
          const response = await fetch(`${url}/health`);
          if (!response.ok) throw new Error(`${name} respondió ${response.status}`);
        },
      ]),
    ),
  );

  res.status(status === "ok" ? 200 : 503).json({ status, services: dependencies });
});

// El body NO se parsea acá — http-proxy-middleware necesita el stream de la
// request intacto para reenviarlo. Si se consumiera con express.json() antes
// del proxy, el downstream recibiría un body vacío.
app.post("/auth/login", loginRateLimiter, authProxy);
app.use("/auth", authProxy);
app.use("/products", inventoryProxy);
app.use("/orders", ordersProxy);
app.use("/notifications", notificationsProxy);
