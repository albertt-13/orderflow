import type { NextFunction, Request, Response } from "express";
import { redis } from "../infra/redis.js";
import { logger } from "../infra/logger.js";

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60;

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
