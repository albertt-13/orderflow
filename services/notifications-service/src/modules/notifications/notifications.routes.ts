import { Router } from "express";
import { requireAuth } from "../../shared/middleware/requireAuth.js";
import { notificationsController } from "./notifications.controller.js";

export const notificationsRouter = Router();

notificationsRouter.get("/me", requireAuth, notificationsController.listMine);
