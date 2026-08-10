import type { Request, Response } from "express";
import { productsService } from "./products.service.js";
import type { CreateProductInput, ListProductsQuery, UpdateProductInput } from "./products.schemas.js";

export const productsController = {
  async create(req: Request, res: Response) {
    const product = await productsService.create(req.body as CreateProductInput);
    res.status(201).json(product);
  },

  async update(req: Request, res: Response) {
    const product = await productsService.update(req.params.id as string, req.body as UpdateProductInput);
    res.status(200).json(product);
  },

  async remove(req: Request, res: Response) {
    await productsService.delete(req.params.id as string);
    res.status(204).send();
  },

  async list(req: Request, res: Response) {
    const { data, cacheHit } = await productsService.list(req.validatedQuery as ListProductsQuery);
    res.setHeader("X-Cache", cacheHit ? "HIT" : "MISS");
    res.status(200).json(data);
  },

  async bestsellers(req: Request, res: Response) {
    const limit = Number(req.query.limit) || 5;
    const result = await productsService.bestsellers(limit);
    res.status(200).json(result);
  },

  /** Lookup interno para otros servicios (ej. orders-service armando el total). */
  async byIds(req: Request, res: Response) {
    const ids = typeof req.query.ids === "string" ? req.query.ids.split(",").filter(Boolean) : [];
    const products = await productsService.findByIds(ids);
    res.status(200).json(products);
  },
};
