import type { Request, Response } from "express";
import { authService } from "./auth.service.js";
import type { LoginInput, RegisterInput } from "./auth.schemas.js";

export const authController = {
  async register(req: Request, res: Response) {
    const tokens = await authService.register(req.body as RegisterInput);
    res.status(201).json(tokens);
  },

  async login(req: Request, res: Response) {
    const tokens = await authService.login(req.body as LoginInput);
    res.status(200).json(tokens);
  },
};
