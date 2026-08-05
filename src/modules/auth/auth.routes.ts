import { Router } from "express";
import { validateBody } from "../../shared/middleware/validate.js";
import { authController } from "./auth.controller.js";
import { registerSchema, loginSchema } from "./auth.schemas.js";

export const authRouter = Router();

authRouter.post("/register", validateBody(registerSchema), authController.register);
authRouter.post("/login", validateBody(loginSchema), authController.login);
