import client from "prom-client";
import type { NextFunction, Request, Response } from "express";

export function createMetrics(serviceName: string) {
  const register = new client.Registry();
  register.setDefaultLabels({ service: serviceName });
  client.collectDefaultMetrics({ register });

  const httpRequestDuration = new client.Histogram({
    name: "http_request_duration_seconds",
    help: "Duración de requests HTTP en segundos",
    labelNames: ["method", "route", "status_code"],
    registers: [register],
  });

  const httpRequestsTotal = new client.Counter({
    name: "http_requests_total",
    help: "Total de requests HTTP procesadas",
    labelNames: ["method", "route", "status_code"],
    registers: [register],
  });

  function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      // req.route.path es la ruta con placeholders (ej. "/products/:id"), no
      // la URL real - sin esto, cada id distinto seria una serie de metrica
      // distinta y la cardinalidad explotaria.
      const route = (req.route as { path?: string } | undefined)?.path ?? req.path;
      const labels = { method: req.method, route, status_code: String(res.statusCode) };
      httpRequestDuration.observe(labels, durationSeconds);
      httpRequestsTotal.inc(labels);
    });
    next();
  }

  async function metricsHandler(_req: Request, res: Response): Promise<void> {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  }

  return { metricsMiddleware, metricsHandler, register };
}
