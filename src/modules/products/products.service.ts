import { redis } from "../../infra/redis.js";
import { NotFoundError } from "../../shared/errors/AppError.js";
import { logger } from "../../shared/logger/index.js";
import { productsRepository } from "./products.repository.js";
import type { CreateProductInput, ListProductsQuery, UpdateProductInput } from "./products.schemas.js";

const CACHE_TTL_SECONDS = 60;
const CACHE_KEY_PREFIX = "products:list:";

function cacheKey(query: ListProductsQuery) {
  return `${CACHE_KEY_PREFIX}page=${query.page}:limit=${query.limit}:name=${query.name ?? ""}`;
}

async function invalidateListCache() {
  try {
    const keys = await redis.keys(`${CACHE_KEY_PREFIX}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    logger.warn({ err }, "no se pudo invalidar el cache de productos (Redis no disponible)");
  }
}

export const productsService = {
  async create(input: CreateProductInput) {
    const product = await productsRepository.create(input);
    await invalidateListCache();
    return product;
  },

  async update(id: string, input: UpdateProductInput) {
    const existing = await productsRepository.findById(id);
    if (!existing) {
      throw new NotFoundError("Producto no encontrado");
    }
    const product = await productsRepository.update(id, input);
    await invalidateListCache();
    return product;
  },

  async delete(id: string) {
    const existing = await productsRepository.findById(id);
    if (!existing) {
      throw new NotFoundError("Producto no encontrado");
    }
    await productsRepository.delete(id);
    await invalidateListCache();
  },

  async list(query: ListProductsQuery) {
    const key = cacheKey(query);

    try {
      const cached = await redis.get(key);
      if (cached) {
        return { data: JSON.parse(cached), cacheHit: true as const };
      }
    } catch (err) {
      logger.warn({ err }, "cache de productos no disponible, se sigue directo a Postgres");
    }

    const { items, total } = await productsRepository.findMany(query);
    const data = {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };

    try {
      await redis.set(key, JSON.stringify(data), "EX", CACHE_TTL_SECONDS);
    } catch (err) {
      logger.warn({ err }, "no se pudo guardar en cache de productos");
    }

    return { data, cacheHit: false as const };
  },
};
