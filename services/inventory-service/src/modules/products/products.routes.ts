import { Router } from "express";
import { requireAuth, requireRole } from "../../shared/middleware/requireAuth.js";
import { validateBody, validateParams, validateQuery } from "../../shared/middleware/validate.js";
import { idParamSchema } from "../../shared/schemas/idParam.js";
import { productsController } from "./products.controller.js";
import { createProductSchema, listProductsQuerySchema, updateProductSchema } from "./products.schemas.js";

export const productsRouter = Router();

productsRouter.get("/", validateQuery(listProductsQuerySchema), productsController.list);
productsRouter.get("/bestsellers", productsController.bestsellers);
productsRouter.get("/by-ids", productsController.byIds);

productsRouter.post(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  validateBody(createProductSchema),
  productsController.create,
);

productsRouter.patch(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  validateParams(idParamSchema),
  validateBody(updateProductSchema),
  productsController.update,
);

productsRouter.delete(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  validateParams(idParamSchema),
  productsController.remove,
);
