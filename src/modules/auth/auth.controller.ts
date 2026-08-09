import type { Request, Response } from "express";
import { authService } from "./auth.service.js";
import type { LoginInput, RefreshInput, RegisterInput } from "./auth.schemas.js";

export const authController = {
  async register(req: Request, res: Response) {
    const tokens = await authService.register(req.body as RegisterInput);
    res.status(201).json(tokens);
  },

  async login(req: Request, res: Response) {
    const tokens = await authService.login(req.body as LoginInput);
    res.status(200).json(tokens);
  },

  async refresh(req: Request, res: Response) {
    const { refreshToken } = req.body as RefreshInput;
    const tokens = await authService.refresh(refreshToken);
    res.status(200).json(tokens);
  },

  async logout(req: Request, res: Response) {
    const { refreshToken } = req.body as RefreshInput;
    await authService.logout(refreshToken);
    res.status(204).send();
  },

  async logoutAll(req: Request, res: Response) {
    await authService.logoutAll(req.user!.userId);
    res.status(204).send();
  },
};
