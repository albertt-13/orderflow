import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "@orderflow/shared";

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
