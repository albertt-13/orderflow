import { NotFoundError } from "@orderflow/shared";
import { redis } from "../../infra/redis.js";
import { logger } from "../../infra/logger.js";
import { productsRepository } from "./products.repository.js";
import type { CreateProductInput, ListProductsQuery, UpdateProductInput } from "./products.schemas.js";

const CACHE_TTL_SECONDS = 60;
const CACHE_KEY_PREFIX = "products:list:";
const BESTSELLERS_KEY = "products:bestsellers";

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
  findByIds(ids: string[]) {
    return productsRepository.findByIds(ids);
  },

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

  async recordSale(productId: string, quantity: number) {
    try {
      await redis.zincrby(BESTSELLERS_KEY, quantity, productId);
    } catch (err) {
      logger.warn({ err }, "no se pudo actualizar el ranking de más vendidos");
    }
  },

  async bestsellers(limit: number) {
    let raw: string[];
    try {
      raw = await redis.zrevrange(BESTSELLERS_KEY, 0, limit - 1, "WITHSCORES");
    } catch (err) {
      logger.warn({ err }, "ranking de más vendidos no disponible (Redis caído)");
      return [];
    }

    const entries: { productId: string; sold: number }[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      entries.push({ productId: raw[i] as string, sold: Number(raw[i + 1]) });
    }
    if (entries.length === 0) return [];

    const products = await productsRepository.findByIds(entries.map((e) => e.productId));
    const productMap = new Map(products.map((p) => [p.id, p]));

    return entries.flatMap((e) => {
      const product = productMap.get(e.productId);
      return product ? [{ ...product, sold: e.sold }] : [];
    });
  },
};
