import pino from "pino";

export function createLogger(serviceName: string) {
  return pino({
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
    base: { service: serviceName },
    transport:
      process.env.NODE_ENV === "production"
        ? undefined
        : { target: "pino-pretty", options: { colorize: true } },
  });
}
