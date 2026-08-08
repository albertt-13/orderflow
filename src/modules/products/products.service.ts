import { NotFoundError } from "../../shared/errors/AppError.js";
import { productsRepository } from "./products.repository.js";
import type { CreateProductInput, ListProductsQuery, UpdateProductInput } from "./products.schemas.js";

export const productsService = {
  create(input: CreateProductInput) {
    return productsRepository.create(input);
  },

  async update(id: string, input: UpdateProductInput) {
    const existing = await productsRepository.findById(id);
    if (!existing) {
      throw new NotFoundError("Producto no encontrado");
    }
    return productsRepository.update(id, input);
  },

  async delete(id: string) {
    const existing = await productsRepository.findById(id);
    if (!existing) {
      throw new NotFoundError("Producto no encontrado");
    }
    await productsRepository.delete(id);
  },

  async list(query: ListProductsQuery) {
    const { items, total } = await productsRepository.findMany(query);
    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },
};
