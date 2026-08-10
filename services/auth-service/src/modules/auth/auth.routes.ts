import { Router } from "express";
import { requireAuth } from "../../shared/middleware/requireAuth.js";
import { validateBody } from "../../shared/middleware/validate.js";
import { authController } from "./auth.controller.js";
import { registerSchema, loginSchema, refreshSchema } from "./auth.schemas.js";

export const authRouter = Router();

authRouter.post("/register", validateBody(registerSchema), authController.register);
authRouter.post("/login", validateBody(loginSchema), authController.login);
authRouter.post("/refresh", validateBody(refreshSchema), authController.refresh);
authRouter.post("/logout", validateBody(refreshSchema), authController.logout);
authRouter.post("/logout-all", requireAuth, authController.logoutAll);
