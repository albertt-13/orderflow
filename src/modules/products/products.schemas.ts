import { z } from "zod";

export const createProductSchema = z.object({
  name: z.string().min(1),
  price: z.coerce.number().positive(),
  stock: z.coerce.number().int().nonnegative().default(0),
});

export const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  price: z.coerce.number().positive().optional(),
  stock: z.coerce.number().int().nonnegative().optional(),
});

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  name: z.string().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
