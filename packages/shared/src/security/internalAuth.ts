import type { NextFunction, Request, Response } from "express";

/**
 * Zero-trust entre el gateway y los servicios internos: en plataformas
 * donde TODOS los servicios quedan con URL pública (ej. Render free tier,
 * a diferencia de docker-compose donde solo el gateway expone puerto), esto
 * evita que alguien le pegue directo a un servicio interno con un
 * x-user-id/x-user-role falsificado, saltándose la validación de JWT del
 * gateway por completo.
 */
export function requireInternalSecret(secret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.headers["x-internal-secret"] !== secret) {
      res.status(403).json({ error: "Acceso directo no permitido, use el gateway" });
      return;
    }
    next();
  };
}
