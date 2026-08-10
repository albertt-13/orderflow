import pino from "pino";

export function createLogger(serviceName: string) {
  return pino({
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
    base: { service: serviceName },
    // Nunca en texto plano en un log: el Authorization trae el JWT, y estos
    // campos de body pueden traer credenciales si algun dia se loguea el
    // body (hoy no se hace, pero mejor no depender de que siga sin pasar).
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "*.password",
        "*.hashedPassword",
        "*.refreshToken",
        "*.accessToken",
      ],
      censor: "[REDACTED]",
    },
    transport:
      process.env.NODE_ENV === "production"
        ? undefined
        : { target: "pino-pretty", options: { colorize: true } },
  });
}
