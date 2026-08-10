import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Genera (o respeta si ya viene) un x-request-id y lo devuelve en la
 * respuesta. Como http-proxy-middleware reenvía los headers del request tal
 * cual, este mismo id viaja a los servicios internos — permite buscar una
 * orden en los logs de gateway + orders-service + inventory-service +
 * notifications-service con el mismo valor.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const existing = req.headers["x-request-id"];
  const id = typeof existing === "string" && existing.length > 0 ? existing : randomUUID();

  req.headers["x-request-id"] = id;
  res.setHeader("x-request-id", id);
  next();
}
