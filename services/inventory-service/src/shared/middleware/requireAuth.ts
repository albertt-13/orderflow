import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "@orderflow/shared";

/**
 * No valida un JWT acá: confía en los headers x-user-id / x-user-role que
 * pone el api-gateway despues de validar el token. Este servicio nunca
 * deberia ser alcanzable directamente desde afuera de la red interna
 * (en docker-compose no expone puerto al host) — la confianza es en la
 * red, no en un segundo chequeo de firma redundante.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const userId = req.headers["x-user-id"];
  if (!userId || typeof userId !== "string") {
    next(new UnauthorizedError("Falta x-user-id (¿llamaste directo, sin pasar por el gateway?)"));
    return;
  }

  const role = req.headers["x-user-role"];
  req.user = { userId, role: typeof role === "string" ? role : "" };
  next();
}

export function requireRole(role: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.user?.role !== role) {
      next(new ForbiddenError("No tenés permisos para esta acción"));
      return;
    }
    next();
  };
}
