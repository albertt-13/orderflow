import { Redis } from "ioredis";
import { env } from "../shared/config/env.js";
import { logger } from "./logger.js";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  connectTimeout: 1000,
  commandTimeout: 500,
  enableOfflineQueue: false,
  retryStrategy(times) {
    return Math.min(times * 200, 2000);
  },
});

redis.on("error", (err) => {
  logger.warn({ err }, "redis error (notifications-service degradado)");
});

redis.on("connect", () => {
  logger.info("redis conectado");
});
