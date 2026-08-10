import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../shared/auth/jwt.js";

/**
 * Decisión de arquitectura: el gateway valida el JWT UNA vez y pasa
 * x-user-id / x-user-role a los servicios internos, que confían en la red
 * interna en vez de volver a verificar la firma cada uno. Riesgo aceptado:
 * si alguien logra pegarle directo a un servicio interno (sin pasar por el
 * gateway), esos headers no están validados por nadie — por eso en
 * docker-compose los servicios internos NO exponen puerto al host.
 *
 * No decide aca si la ruta REQUIERE auth (eso lo sigue decidiendo cada
 * servicio con su propio requireAuth): si no hay token o es inválido,
 * simplemente no se setean los headers y el downstream rechaza si le hacen
 * falta.
 */
export function forwardAuthHeaders(req: Request, _res: Response, next: NextFunction): void {
  // Se borran SIEMPRE primero, sin importar si hay token o no. Si no se
  // borraran acá, un cliente podría mandar x-user-id/x-user-role el mismo
  // directo y hacerse pasar por cualquier usuario sin token válido.
  delete req.headers["x-user-id"];
  delete req.headers["x-user-role"];

  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const payload = verifyAccessToken(header.slice("Bearer ".length));
      req.headers["x-user-id"] = payload.userId;
      req.headers["x-user-role"] = payload.role;
    } catch {
      // token invalido/expirado: seguimos sin los headers, el downstream
      // rechaza si la ruta los necesita.
    }
  }
  next();
}
