import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "@orderflow/shared";

/** Confía en x-user-id / x-user-role puestos por el api-gateway. Ver nota igual en inventory-service. */
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
