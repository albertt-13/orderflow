import { Router } from "express";
import { requireAuth, requireRole } from "../../shared/middleware/requireAuth.js";
import { validateBody, validateParams } from "../../shared/middleware/validate.js";
import { idParamSchema } from "../../shared/schemas/idParam.js";
import { ordersController } from "./orders.controller.js";
import { createOrderSchema, updateOrderStatusSchema } from "./orders.schemas.js";

export const ordersRouter = Router();

ordersRouter.post("/", requireAuth, validateBody(createOrderSchema), ordersController.create);
ordersRouter.get("/me", requireAuth, ordersController.listMine);
ordersRouter.get("/:id", requireAuth, validateParams(idParamSchema), ordersController.getOne);

ordersRouter.patch(
  "/:id/status",
  requireAuth,
  requireRole("ADMIN"),
  validateParams(idParamSchema),
  validateBody(updateOrderStatusSchema),
  ordersController.advanceStatus,
);
