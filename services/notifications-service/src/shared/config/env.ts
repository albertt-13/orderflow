import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4004),
  MONGODB_URL: z.string().min(1),
  RABBITMQ_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  INTERNAL_SERVICE_SECRET: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Variables de entorno inválidas o faltantes en notifications-service:");
  console.error(parsed.error.issues);
  process.exit(1);
}

export const env = parsed.data;
