import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError, ForbiddenError } from "../errors/AppError.js";
import { verifyAccessToken } from "../auth/jwt.js";

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next(new UnauthorizedError("Falta el token de autenticación"));
    return;
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch {
    next(new UnauthorizedError("Token inválido o expirado"));
  }
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
