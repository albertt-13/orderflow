import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  JWT_ACCESS_SECRET: z.string().min(1),
  REDIS_URL: z.string().url(),
  AUTH_SERVICE_URL: z.string().url(),
  INVENTORY_SERVICE_URL: z.string().url(),
  ORDERS_SERVICE_URL: z.string().url(),
  NOTIFICATIONS_SERVICE_URL: z.string().url(),
  // Whitelist explicita, separada por comas. Vacio por defecto = ningun
  // origen de browser puede llamar (todavia no hay frontend). Cuando exista
  // uno (ej. el dashboard de la mutacion Data4Sales), se agrega su origen.
  CORS_ORIGINS: z
    .string()
    .default("")
    .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean)),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Variables de entorno inválidas o faltantes en api-gateway:");
  console.error(parsed.error.issues);
  process.exit(1);
}

export const env = parsed.data;
