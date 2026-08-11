import type { Request } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { env } from "./shared/config/env.js";
import { logger } from "./infra/logger.js";

const PROXY_TIMEOUT_MS = 5000;

function proxyTo(target: string) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    // Reconstruye la URL completa original: Express ya le sacó el prefijo
    // de mount (ej. "/auth") a req.url antes de llegar acá.
    pathRewrite: (_path, req) => (req as Request).originalUrl,
    proxyTimeout: PROXY_TIMEOUT_MS,
    timeout: PROXY_TIMEOUT_MS,
    on: {
      proxyReq: (proxyReq) => {
        proxyReq.setHeader("x-internal-secret", env.INTERNAL_SERVICE_SECRET);
      },
      error: (err, _req, res) => {
        logger.warn({ err, target }, "proxy: el servicio downstream no respondió");
        if ("writeHead" in res) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Servicio no disponible" }));
        }
      },
    },
  });
}

export const authProxy = proxyTo(env.AUTH_SERVICE_URL);
export const inventoryProxy = proxyTo(env.INVENTORY_SERVICE_URL);
export const ordersProxy = proxyTo(env.ORDERS_SERVICE_URL);
export const notificationsProxy = proxyTo(env.NOTIFICATIONS_SERVICE_URL);
