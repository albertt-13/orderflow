import type { NextFunction, Request, Response } from "express";
import { redis } from "../../infra/redis.js";
import { logger } from "../logger/index.js";

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60;

/**
 * Rate limit a mano con INCR + EXPIRE (fixed window) en vez de una librería,
 * para ver el mecanismo pelado. Fail-open: si Redis está caído, se deja pasar
 * el request (loguéandolo) en vez de bloquear logins legítimos por una caída
 * de infraestructura que no tiene nada que ver con fuerza bruta.
 */
export async function loginRateLimiter(req: Request, res: Response, next: NextFunction): Promise<void> {
  const key = `ratelimit:login:${req.ip}`;

  try {
    const attempts = await redis.incr(key);

    if (attempts === 1) {
      await redis.expire(key, WINDOW_SECONDS);
    }

    if (attempts > MAX_ATTEMPTS) {
      const ttl = await redis.ttl(key);
      res.setHeader("Retry-After", String(ttl > 0 ? ttl : WINDOW_SECONDS));
      res.status(429).json({ error: "Demasiados intentos de login, probá de nuevo más tarde" });
      return;
    }

    next();
  } catch (err) {
    logger.warn({ err }, "rate limiter de login degradado (Redis no disponible)");
    next();
  }
}
