import type { Request, Response } from "express";
import { ordersService } from "./orders.service.js";
import type { CreateOrderInput, UpdateOrderStatusInput } from "./orders.schemas.js";

export const ordersController = {
  async create(req: Request, res: Response) {
    const userId = req.user!.userId;
    const order = await ordersService.create(userId, req.body as CreateOrderInput);
    res.status(201).json(order);
  },

  async listMine(req: Request, res: Response) {
    const userId = req.user!.userId;
    const orders = await ordersService.listForUser(userId);
    res.status(200).json(orders);
  },

  async advanceStatus(req: Request, res: Response) {
    const { status } = req.body as UpdateOrderStatusInput;
    const order = await ordersService.advanceStatus(req.params.id as string, status);
    res.status(200).json(order);
  },
};
