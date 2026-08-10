import type { Request, Response } from "express";
import { notificationsService } from "./notifications.service.js";

export const notificationsController = {
  async listMine(req: Request, res: Response) {
    const notifications = await notificationsService.listForUser(req.user!.userId);
    res.status(200).json(notifications);
  },
};
