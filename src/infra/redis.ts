import { Redis } from "ioredis";
import { env } from "../shared/config/env.js";
import { logger } from "../shared/logger/index.js";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  connectTimeout: 1000,
  commandTimeout: 500,
  // Si Redis no esta disponible, los comandos fallan YA en vez de encolarse
  // a esperar reconexion — es lo que permite que el resto de la app degrade
  // en vez de colgarse.
  enableOfflineQueue: false,
  retryStrategy(times) {
    return Math.min(times * 200, 2000);
  },
});

redis.on("error", (err) => {
  logger.warn({ err }, "redis error (la app sigue funcionando degradada)");
});

redis.on("connect", () => {
  logger.info("redis conectado");
});
