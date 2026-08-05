import express from "express";
import { pinoHttp } from "pino-http";
import { logger } from "./shared/logger/index.js";

export const app = express();

app.use(pinoHttp({ logger }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
