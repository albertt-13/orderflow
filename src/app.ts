import express from "express";
import { pinoHttp } from "pino-http";
import { logger } from "./shared/logger/index.js";
import { errorHandler } from "./shared/middleware/errorHandler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { productsRouter } from "./modules/products/products.routes.js";

export const app = express();

app.use(pinoHttp({ logger }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use("/products", productsRouter);

app.use(errorHandler);
